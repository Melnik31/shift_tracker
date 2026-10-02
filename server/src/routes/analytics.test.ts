import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole, getDefaultCampus, createCampus } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('analytics read routes', () => {
  it('returns the workspace-wide overview for a date range', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.get('/api/analytics/overview').query({ start: '2026-08-01', end: '2026-08-07' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('employees');
    expect(res.body).toHaveProperty('totals');
  });

  it('404s an employeeId that does not belong to the caller\'s workspace', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.get('/api/analytics/breaks').query({ employeeId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('404s a group-hours employeeId that does not belong to the caller\'s workspace', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});

describe('analytics role gating (requireRole DIRECTOR/ADMIN/CEO)', () => {
  it('404s a COACH session (employee login)', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AROLE1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await coachAgent.get('/api/analytics/overview')).status).toBe(404);
    expect((await coachAgent.get('/api/analytics/breaks').query({ employeeId: 'x' })).status).toBe(404);
    expect((await coachAgent.get('/api/analytics/group-hours').query({ employeeId: 'x' })).status).toBe(404);
  });

  it('DIRECTOR, ADMIN, and CEO all succeed identically on these read-only routes', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'AROLE2' });
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@arole2.example', 'DIRECTOR');
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@arole2.example', 'CEO');
    const employee = (await adminAgent.post('/api/employees').send({ name: 'Emp', pin: '2222' })).body;

    for (const agent of [adminAgent, directorAgent, ceoAgent]) {
      expect((await agent.get('/api/analytics/overview').query({ start: '2026-08-01', end: '2026-08-07' })).status).toBe(200);
      expect((await agent.get('/api/analytics/breaks').query({ employeeId: employee.id })).status).toBe(200);
      expect(
        (await agent.get('/api/analytics/group-hours').query({ employeeId: employee.id, start: '2026-08-01', end: '2026-08-07' })).status
      ).toBe(200);
    }
  });
});

describe('coach group hours (SubRow.isGroupField aggregation)', () => {
  async function makeGroupLocation(agent: Awaited<ReturnType<typeof signupAdmin>>['agent'], sectionName = 'Ice') {
    const section = (await agent.post('/api/layout/sections').send({ name: sectionName })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const tier = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Tier', dataType: 'BADGE' })).body;
    await agent.patch(`/api/layout/subrows/${tier.id}`).send({ isGroupField: true });
    const staff = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Coach', dataType: 'STAFF' })).body;
    return { section, location, tier, staff };
  }

  it('sums hours per group across two blockId-grouped practices', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'GH1' });
    const { tier, staff } = await makeGroupLocation(agent);
    const coach = (await agent.post('/api/employees').send({ name: 'Coach One', pin: '1111' })).body;

    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '20:00', // 4 hours
      rows: [
        { subRowId: tier.id, badgeLabel: 'T2 BLUE', badgeColor: '#3b82f6' },
        { subRowId: staff.id, staffEmployeeIds: [coach.id] },
      ],
    });
    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-02',
      startTime: '17:00',
      endTime: '19:00', // 2 hours
      rows: [
        { subRowId: tier.id, badgeLabel: 'HS', badgeColor: '#ef4444' },
        { subRowId: staff.id, staffEmployeeIds: [coach.id] },
      ],
    });

    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31' });
    expect(res.status).toBe(200);
    expect(res.body.totalHours).toBe(6);
    expect(res.body.groups).toEqual([
      { group: 'T2 BLUE', color: '#3b82f6', hours: 4, shiftCount: 1 },
      { group: 'HS', color: '#ef4444', hours: 2, shiftCount: 1 },
    ]);
  });

  it('buckets as "Ungrouped" when the Location has no group field configured', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'GH2' });
    const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const staff = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Coach', dataType: 'STAFF' })).body;
    const coach = (await agent.post('/api/employees').send({ name: 'Coach', pin: '1111' })).body;

    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '18:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [coach.id] }],
    });

    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31' });
    expect(res.body.groups).toEqual([{ group: 'Ungrouped', color: null, hours: 2, shiftCount: 1 }]);
  });

  it('buckets as "Ungrouped" when the group field exists but its row was left blank that block', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'GH3' });
    const { tier, staff } = await makeGroupLocation(agent);
    const coach = (await agent.post('/api/employees').send({ name: 'Coach', pin: '1111' })).body;

    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '18:00',
      rows: [
        { subRowId: tier.id, badgeLabel: '' }, // blank — skipped, no sibling shift created
        { subRowId: staff.id, staffEmployeeIds: [coach.id] },
      ],
    });

    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31' });
    expect(res.body.groups).toEqual([{ group: 'Ungrouped', color: null, hours: 2, shiftCount: 1 }]);
  });

  it('groups legacy (non-blockId) shifts via the same locationId+date+startTime+endTime fallback the Matrix view uses', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'GH4' });
    const { tier, staff } = await makeGroupLocation(agent);
    const coach = (await agent.post('/api/employees').send({ name: 'Coach', pin: '1111' })).body;

    const tierShift = await agent
      .post('/api/shifts')
      .send({ subRowId: tier.id, date: '2026-08-01', startTime: '16:00', endTime: '19:00' });
    await agent.patch(`/api/shifts/cells/${tierShift.body.cellValues[0].id}`).send({ badgeLabel: 'COLL', badgeColor: '#a855f7' });

    const staffShift = await agent
      .post('/api/shifts')
      .send({ subRowId: staff.id, date: '2026-08-01', startTime: '16:00', endTime: '19:00' });
    await agent.patch(`/api/shifts/cells/${staffShift.body.cellValues[0].id}`).send({ staffEmployeeIds: [coach.id] });

    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31' });
    expect(res.body.groups).toEqual([{ group: 'COLL', color: '#a855f7', hours: 3, shiftCount: 1 }]);
  });

  it('excludes a cancelled coach shift from the totals', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'GH5' });
    const { tier, staff } = await makeGroupLocation(agent);
    const coach = (await agent.post('/api/employees').send({ name: 'Coach', pin: '1111' })).body;

    const created = await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '18:00',
      rows: [
        { subRowId: tier.id, badgeLabel: 'T2 BLUE', badgeColor: '#3b82f6' },
        { subRowId: staff.id, staffEmployeeIds: [coach.id] },
      ],
    });
    const staffShiftId = created.body.created.find((c: { subRowId: string }) => c.subRowId === staff.id).shiftId;
    await agent.patch(`/api/shifts/${staffShiftId}`).send({ cancelled: true });

    const res = await agent.get('/api/analytics/group-hours').query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31' });
    expect(res.body.groups).toEqual([]);
    expect(res.body.totalHours).toBe(0);
  });

  it('narrows to one campus with ?campusId=, excluding a shift at another campus', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'GH6' });
    const campusA = await getDefaultCampus(workspace.id);
    const campusB = await createCampus(workspace.id, 'Campus B');

    const sectionA = (await agent.post('/api/layout/sections').send({ name: 'Ice A', campusId: campusA.id })).body;
    const locationA = (await agent.post('/api/layout/locations').send({ sectionId: sectionA.id, name: 'Rink A' })).body;
    const tierA = (await agent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Tier', dataType: 'BADGE' })).body;
    await agent.patch(`/api/layout/subrows/${tierA.id}`).send({ isGroupField: true });
    const staffA = (await agent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Coach', dataType: 'STAFF' })).body;

    const sectionB = (await agent.post('/api/layout/sections').send({ name: 'Ice B', campusId: campusB.id })).body;
    const locationB = (await agent.post('/api/layout/locations').send({ sectionId: sectionB.id, name: 'Rink B' })).body;
    const tierB = (await agent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Tier', dataType: 'BADGE' })).body;
    await agent.patch(`/api/layout/subrows/${tierB.id}`).send({ isGroupField: true });
    const staffB = (await agent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Coach', dataType: 'STAFF' })).body;

    const coach = (await agent.post('/api/employees').send({ name: 'Coach', pin: '1111', campusIds: [campusA.id, campusB.id] })).body;

    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '18:00',
      rows: [
        { subRowId: tierA.id, badgeLabel: 'T2 BLUE', badgeColor: '#3b82f6' },
        { subRowId: staffA.id, staffEmployeeIds: [coach.id] },
      ],
    });
    await agent.post('/api/shifts/bulk').send({
      date: '2026-08-01',
      startTime: '16:00',
      endTime: '20:00',
      rows: [
        { subRowId: tierB.id, badgeLabel: 'HS', badgeColor: '#ef4444' },
        { subRowId: staffB.id, staffEmployeeIds: [coach.id] },
      ],
    });

    const res = await agent
      .get('/api/analytics/group-hours')
      .query({ employeeId: coach.id, start: '2026-08-01', end: '2026-08-31', campusId: campusA.id });
    expect(res.body.groups).toEqual([{ group: 'T2 BLUE', color: '#3b82f6', hours: 2, shiftCount: 1 }]);
  });
});
