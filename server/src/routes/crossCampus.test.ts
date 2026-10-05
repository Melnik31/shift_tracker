import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, seedAdminWithRole, createCampus, getDefaultCampus, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

const DATE = '2030-06-11';

// Campus A (default) has a STAFF row; the coach belongs only to Campus B.
async function setup(workspaceCode: string) {
  const { agent: admin, workspace } = await signupAdmin(app, { workspaceCode });
  const campusA = await getDefaultCampus(workspace.id);
  const campusB = await createCampus(workspace.id, 'Campus B');
  const section = (await admin.post('/api/layout/sections').send({ name: 'Ice', campusId: campusA.id })).body;
  const location = (await admin.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
  const staff = (await admin.post('/api/layout/subrows').send({ locationId: location.id, label: 'Coach', dataType: 'STAFF' })).body;
  const coach = (await admin.post('/api/employees').send({ name: 'Outsider', pin: '1111', campusIds: [campusB.id] })).body;
  const director = await seedAdminWithRole(app, workspace.id, `dir@${workspaceCode.toLowerCase()}.example`, 'DIRECTOR', { campusId: campusA.id });
  return { admin, director, workspace, campusA, campusB, staff, coach };
}

async function bulk(agent: Awaited<ReturnType<typeof setup>>['admin'], staffId: string, ids: string[], allowCrossCampus?: boolean) {
  return agent.post('/api/shifts/bulk').send({
    date: DATE,
    startTime: '16:00',
    endTime: '17:00',
    rows: [{ subRowId: staffId, staffEmployeeIds: ids }],
    ...(allowCrossCampus ? { allowCrossCampus } : {}),
  });
}

async function assigned(agent: Awaited<ReturnType<typeof setup>>['admin']) {
  const shifts = (await agent.get('/api/shifts').query({ date: DATE })).body.shifts;
  return shifts.flatMap((s: any) => s.cellValues.flatMap((c: any) => c.staffAssignments.map((a: any) => a.employee.id)));
}

describe('assigning a coach from another campus to a shift', () => {
  it('bulk create: dropped by default, kept for ADMIN with allowCrossCampus', async () => {
    const { admin, staff, coach } = await setup('XC1');

    expect((await bulk(admin, staff.id, [coach.id])).status).toBe(201);
    expect(await assigned(admin)).toEqual([]);

    expect((await bulk(admin, staff.id, [coach.id], true)).status).toBe(201);
    expect(await assigned(admin)).toEqual([coach.id]);
  });

  it('cell PATCH: dropped by default, kept for ADMIN with allowCrossCampus', async () => {
    const { admin, staff, coach } = await setup('XC2');
    const cellId = (await admin.post('/api/shifts').send({ subRowId: staff.id, date: DATE, startTime: '16:00', endTime: '17:00' })).body.cellValues[0].id;

    const without = await admin.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [coach.id] });
    expect(without.body.staffAssignments).toHaveLength(0);

    const withFlag = await admin.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [coach.id], allowCrossCampus: true });
    expect(withFlag.body.staffAssignments.map((a: any) => a.employee.id)).toEqual([coach.id]);
  });

  it("doesn't change the coach's campus membership", async () => {
    const { admin, staff, coach, campusB } = await setup('XC3');
    await bulk(admin, staff.id, [coach.id], true);
    const employees = (await admin.get('/api/employees')).body.employees;
    expect(employees.find((e: any) => e.id === coach.id).campuses.map((c: any) => c.id)).toEqual([campusB.id]);
  });

  it('a Director (or any non-Admin/CEO) sending the flag gets 403 on both routes', async () => {
    const { admin, director, staff, coach } = await setup('XC4');
    expect((await bulk(director, staff.id, [coach.id], true)).status).toBe(403);

    const cellId = (await admin.post('/api/shifts').send({ subRowId: staff.id, date: DATE, startTime: '16:00', endTime: '17:00' })).body.cellValues[0].id;
    const res = await director.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [coach.id], allowCrossCampus: true });
    expect(res.status).toBe(403);
    expect(await assigned(admin)).toEqual([]);
  });

  it('a Director saving a shift keeps an admin-added out-of-campus coach, and can still remove them', async () => {
    const { admin, director, staff, coach } = await setup('XC5');
    await bulk(admin, staff.id, [coach.id], true);
    const shift = (await admin.get('/api/shifts').query({ date: DATE })).body.shifts[0];
    const cellId = shift.cellValues[0].id;

    // Saving with the coach still in the list (no flag) keeps them.
    const kept = await director.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [coach.id] });
    expect(kept.body.staffAssignments.map((a: any) => a.employee.id)).toEqual([coach.id]);

    // The Director can't ADD another campus's coach to a different cell, but can remove this one.
    const removed = await director.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [] });
    expect(removed.body.staffAssignments).toHaveLength(0);
  });

  it('still drops another workspace\'s employees and coaches on approved time off, even with the flag', async () => {
    const { admin, staff, coach } = await setup('XC6');
    const { agent: otherAdmin } = await signupAdmin(app, { workspaceCode: 'XC6OTHER' });
    const stranger = (await otherAdmin.post('/api/employees').send({ name: 'Stranger', pin: '2222' })).body;

    expect((await bulk(admin, staff.id, [stranger.id], true)).status).toBe(201);
    expect(await assigned(admin)).toEqual([]);

    const coachSession = await loginEmployee(app, 'XC6', '1111');
    const req = (await coachSession.agent.post('/api/my/time-off').send({ startDate: DATE, endDate: DATE })).body;
    await admin.post(`/api/time-off/${req.id}/approve`);

    await bulk(admin, staff.id, [coach.id], true);
    expect(await assigned(admin)).toEqual([]);
  });
});
