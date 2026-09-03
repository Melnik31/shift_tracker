import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole, getDefaultCampus } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('campuses role gating (requireRole ADMIN/CEO)', () => {
  it('404s a COACH session and a DIRECTOR session', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');
    const defaultCampus = await getDefaultCampus(workspace.id);
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@cp1.example', 'DIRECTOR', { campusId: defaultCampus.id });

    expect((await coachAgent.get('/api/campuses')).status).toBe(404);
    expect((await directorAgent.get('/api/campuses')).status).toBe(404);
    expect((await directorAgent.post('/api/campuses').send({ name: 'Sneaky' })).status).toBe(404);
  });

  it('CEO gets identical, full access to ADMIN', async () => {
    const { workspace } = await signupAdmin(app, { workspaceCode: 'CP2' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@cp2.example', 'CEO');

    const created = await ceoAgent.post('/api/campuses').send({ name: 'Second' });
    expect(created.status).toBe(201);
  });
});

describe('GET /api/campuses', () => {
  it('lists every campus with section/admin counts, sorted by sortOrder', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP3' });
    const second = (await agent.post('/api/campuses').send({ name: 'Roseville' })).body;
    await agent.post('/api/layout/sections').send({ name: 'A Section', campusId: second.id });
    await seedAdminWithRole(app, workspace.id, 'dir@cp3.example', 'DIRECTOR', { campusId: second.id });

    const res = await agent.get('/api/campuses');
    expect(res.status).toBe(200);
    expect(res.body.campuses.map((c: any) => c.name)).toEqual(['Main Campus', 'Roseville']);
    const roseville = res.body.campuses.find((c: any) => c.name === 'Roseville');
    expect(roseville.sectionCount).toBe(1);
    expect(roseville.adminCount).toBe(1);
    expect(roseville.isDefault).toBe(false);
    expect(roseville.active).toBe(true);
  });
});

describe('POST /api/campuses', () => {
  it('creates a campus, not default, active, next sortOrder', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP4' });
    const res = await agent.post('/api/campuses').send({ name: 'Hudson' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Hudson');
    expect(res.body.isDefault).toBe(false);
    expect(res.body.active).toBe(true);
    expect(res.body.sortOrder).toBe(1);
  });

  it('400s a blank name', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP5' });
    expect((await agent.post('/api/campuses').send({ name: '   ' })).status).toBe(400);
    expect((await agent.post('/api/campuses').send({})).status).toBe(400);
  });
});

describe('PATCH /api/campuses/:id', () => {
  it('renames a campus', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP6' });
    const campus = (await agent.post('/api/campuses').send({ name: 'Old Name' })).body;
    const res = await agent.patch(`/api/campuses/${campus.id}`).send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('404s a campus id from another workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP7' });
    const { workspace: otherWorkspace } = await signupAdmin(app, { workspaceCode: 'CP7B' });
    const otherCampus = await getDefaultCampus(otherWorkspace.id);

    const res = await agent.patch(`/api/campuses/${otherCampus.id}`).send({ name: 'hijacked' });
    expect(res.status).toBe(404);
  });
});

describe('set-default', () => {
  it('atomically moves isDefault to the new campus, unsetting the old one', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP8' });
    const original = await getDefaultCampus(workspace.id);
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;

    const res = await agent.post(`/api/campuses/${second.id}/set-default`);
    expect(res.status).toBe(200);

    const list = (await agent.get('/api/campuses')).body.campuses;
    expect(list.find((c: any) => c.id === second.id).isDefault).toBe(true);
    expect(list.find((c: any) => c.id === original.id).isDefault).toBe(false);
  });

  it('cannot set an inactive campus as default', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP9' });
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    await agent.post(`/api/campuses/${second.id}/deactivate`);

    const res = await agent.post(`/api/campuses/${second.id}/set-default`);
    expect(res.status).toBe(409);
  });
});

describe('deactivate / activate', () => {
  it('cannot deactivate the current default campus', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP10' });
    const defaultCampus = await getDefaultCampus(workspace.id);

    const res = await agent.post(`/api/campuses/${defaultCampus.id}/deactivate`);
    expect(res.status).toBe(409);
  });

  it('can deactivate a non-default campus, and reactivate it', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CP11' });
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;

    const deactivated = await agent.post(`/api/campuses/${second.id}/deactivate`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);

    const reactivated = await agent.post(`/api/campuses/${second.id}/activate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.active).toBe(true);
  });

  it('deactivating a campus does not touch its existing Sections or admin assignments', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP12' });
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    const section = (await agent.post('/api/layout/sections').send({ name: 'Still Here', campusId: second.id })).body;
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'dir@cp12.example', 'DIRECTOR', { campusId: second.id });

    await agent.post(`/api/campuses/${second.id}/deactivate`);

    // Section still exists and the Director can still reach it — deactivation
    // is a "create new" gate, not a retroactive access change.
    const layout = await directorAgent.get('/api/layout');
    expect(layout.body.sections.map((s: any) => s.id)).toContain(section.id);
  });
});

describe('campusId filter on GET /api/layout, /api/shifts, /api/analytics/overview', () => {
  it('an unrestricted ADMIN narrows to one campus with ?campusId=, and sees everything without it', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP13' });
    const mainCampus = await getDefaultCampus(workspace.id);
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    const sectionA = (await agent.post('/api/layout/sections').send({ name: 'A' })).body;
    const sectionB = (await agent.post('/api/layout/sections').send({ name: 'B', campusId: second.id })).body;

    const all = await agent.get('/api/layout');
    expect(all.body.sections.map((s: any) => s.id).sort()).toEqual([sectionA.id, sectionB.id].sort());

    const onlyA = await agent.get('/api/layout').query({ campusId: mainCampus.id });
    expect(onlyA.body.sections.map((s: any) => s.id)).toEqual([sectionA.id]);

    const onlyB = await agent.get('/api/layout').query({ campusId: second.id });
    expect(onlyB.body.sections.map((s: any) => s.id)).toEqual([sectionB.id]);
  });

  it('?campusId= is ignored for a restricted DIRECTOR (their own session scope always wins)', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP14' });
    const mainCampus = await getDefaultCampus(workspace.id);
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    await agent.post('/api/layout/sections').send({ name: 'A' });
    const sectionB = (await agent.post('/api/layout/sections').send({ name: 'B', campusId: second.id })).body;
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'dir@cp14.example', 'DIRECTOR', { campusId: mainCampus.id });

    // Director is scoped to mainCampus; trying to ask for Campus B via the
    // query param must not let them see it — a restricted caller's own
    // session-derived campus always takes precedence.
    const res = await directorAgent.get('/api/layout').query({ campusId: second.id });
    expect(res.body.sections.map((s: any) => s.id)).not.toContain(sectionB.id);
  });

  it('/api/analytics/overview respects the same campusId filter', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP15' });
    const mainCampus = await getDefaultCampus(workspace.id);
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;

    const sectionA = (await agent.post('/api/layout/sections').send({ name: 'A' })).body;
    const locationA = (await agent.post('/api/layout/locations').send({ sectionId: sectionA.id, name: 'LA' })).body;
    const subRowA = (await agent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Staff', dataType: 'STAFF' })).body;

    const sectionB = (await agent.post('/api/layout/sections').send({ name: 'B', campusId: second.id })).body;
    const locationB = (await agent.post('/api/layout/locations').send({ sectionId: sectionB.id, name: 'LB' })).body;
    const subRowB = (await agent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Staff', dataType: 'STAFF' })).body;

    const empA = (await agent.post('/api/employees').send({ name: 'Emp A', pin: '1234' })).body;
    const empB = (await agent.post('/api/employees').send({ name: 'Emp B', pin: '5678' })).body;
    const shiftA = (await agent.post('/api/shifts').send({ subRowId: subRowA.id, date: '2026-09-01', startTime: '09:00', endTime: '17:00' })).body;
    await agent.patch(`/api/shifts/cells/${shiftA.cellValues[0].id}`).send({ staffEmployeeIds: [empA.id] });
    const shiftB = (await agent.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-09-01', startTime: '09:00', endTime: '17:00' })).body;
    await agent.patch(`/api/shifts/cells/${shiftB.cellValues[0].id}`).send({ staffEmployeeIds: [empB.id] });

    const onlyA = await agent.get('/api/analytics/overview').query({ start: '2026-09-01', end: '2026-09-01', campusId: mainCampus.id });
    expect(onlyA.body.employees.map((e: any) => e.name)).toEqual(['Emp A']);

    const onlyB = await agent.get('/api/analytics/overview').query({ start: '2026-09-01', end: '2026-09-01', campusId: second.id });
    expect(onlyB.body.employees.map((e: any) => e.name)).toEqual(['Emp B']);

    const both = await agent.get('/api/analytics/overview').query({ start: '2026-09-01', end: '2026-09-01' });
    expect(both.body.employees.map((e: any) => e.name).sort()).toEqual(['Emp A', 'Emp B']);
  });

  it('a DIRECTOR/SENIOR_LEAD_INSTRUCTOR with no campus assigned gets an empty overview (fail closed), not the full workspace', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CP16' });
    const subRow = (
      await agent.post('/api/layout/subrows').send({
        locationId: (await agent.post('/api/layout/locations').send({ sectionId: (await agent.post('/api/layout/sections').send({ name: 'A' })).body.id, name: 'L' })).body.id,
        label: 'Staff',
        dataType: 'STAFF',
      })
    ).body;
    const emp = (await agent.post('/api/employees').send({ name: 'Emp', pin: '1234' })).body;
    const shift = (await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-09-01', startTime: '09:00', endTime: '17:00' })).body;
    await agent.patch(`/api/shifts/cells/${shift.cellValues[0].id}`).send({ staffEmployeeIds: [emp.id] });

    const unassigned = await seedAdminWithRole(app, workspace.id, 'unassigned@cp16.example', 'DIRECTOR');
    const res = await unassigned.get('/api/analytics/overview').query({ start: '2026-09-01', end: '2026-09-01' });
    expect(res.status).toBe(200);
    expect(res.body.employees).toEqual([]);
  });
});
