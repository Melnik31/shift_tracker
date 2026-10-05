import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole, createCampus } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

// Far-future dates, so "cannot start in the past" never trips on these.
const START = '2030-06-10';
const END = '2030-06-12';

async function setup(workspaceCode: string) {
  const admin = await signupAdmin(app, { workspaceCode });
  const employee = (await admin.agent.post('/api/employees').send({ name: 'Coach One', pin: '1111' })).body;
  const coach = await loginEmployee(app, workspaceCode, '1111');
  return { admin, employee, coach };
}

async function makeStaffRow(agent: Awaited<ReturnType<typeof signupAdmin>>['agent'], campusId?: string) {
  const section = (await agent.post('/api/layout/sections').send({ name: 'Ice', ...(campusId ? { campusId } : {}) })).body;
  const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
  return (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Coach', dataType: 'STAFF' })).body;
}

describe('coach time-off requests (/api/my/time-off)', () => {
  it('creates, lists, and cancels a pending request', async () => {
    const { coach } = await setup('TO1');

    const created = await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END, reason: ' Family trip ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ startDate: START, endDate: END, reason: 'Family trip', status: 'PENDING' });

    const listed = await coach.agent.get('/api/my/time-off');
    expect(listed.body.requests).toHaveLength(1);

    const cancelled = await coach.agent.post(`/api/my/time-off/${created.body.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    // Already cancelled → can't cancel again.
    expect((await coach.agent.post(`/api/my/time-off/${created.body.id}/cancel`)).status).toBe(409);
  });

  it('validates the date range', async () => {
    const { coach } = await setup('TO2');
    expect((await coach.agent.post('/api/my/time-off').send({ startDate: 'nope', endDate: END })).status).toBe(400);
    expect((await coach.agent.post('/api/my/time-off').send({ startDate: END, endDate: START })).status).toBe(400);
    expect((await coach.agent.post('/api/my/time-off').send({ startDate: '2020-01-01', endDate: '2020-01-02' })).status).toBe(400);
    // Same day = a single day off.
    expect((await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: START })).status).toBe(201);
  });

  it("can't cancel another coach's request", async () => {
    const { admin, coach } = await setup('TO3');
    await admin.agent.post('/api/employees').send({ name: 'Coach Two', pin: '2222' });
    const other = await loginEmployee(app, 'TO3', '2222');
    const req = (await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END })).body;

    expect((await other.agent.post(`/api/my/time-off/${req.id}/cancel`)).status).toBe(404);
    expect((await other.agent.get('/api/my/time-off')).body.requests).toHaveLength(0);
  });

  it('rejects an admin session on the coach routes', async () => {
    const { admin } = await setup('TO4');
    expect((await admin.agent.get('/api/my/time-off')).status).toBe(401);
  });
});

describe('admin review (/api/time-off)', () => {
  it('404s a coach session (admin roles only)', async () => {
    const { coach } = await setup('TO5');
    expect((await coach.agent.get('/api/time-off')).status).toBe(404);
    expect((await coach.agent.get('/api/time-off/pending-count')).status).toBe(404);
  });

  it('lists pending requests with a count, approves one, denies another with a note the coach can see', async () => {
    const { admin, coach } = await setup('TO6');
    const a = (await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END })).body;
    const b = (await coach.agent.post('/api/my/time-off').send({ startDate: '2030-07-01', endDate: '2030-07-01' })).body;

    expect((await admin.agent.get('/api/time-off/pending-count')).body.count).toBe(2);
    const pending = (await admin.agent.get('/api/time-off')).body.requests;
    expect(pending.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
    expect(pending[0].employee.name).toBe('Coach One');

    const approved = await admin.agent.post(`/api/time-off/${a.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.reviewedById).toBeTruthy();

    const denied = await admin.agent.post(`/api/time-off/${b.id}/deny`).send({ note: 'Tournament weekend' });
    expect(denied.body).toMatchObject({ status: 'DENIED', decisionNote: 'Tournament weekend' });

    // Can't decide twice.
    expect((await admin.agent.post(`/api/time-off/${a.id}/deny`)).status).toBe(409);
    expect((await admin.agent.get('/api/time-off/pending-count')).body.count).toBe(0);

    const mine = (await coach.agent.get('/api/my/time-off')).body.requests;
    expect(mine.find((r: { id: string }) => r.id === b.id).decisionNote).toBe('Tournament weekend');
  });

  it('reports which employees are off on a date', async () => {
    const { admin, employee, coach } = await setup('TO7');
    const r = (await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END })).body;

    expect((await admin.agent.get('/api/time-off/off').query({ date: '2030-06-11' })).body.employeeIds).toEqual([]); // pending ≠ off
    await admin.agent.post(`/api/time-off/${r.id}/approve`);
    expect((await admin.agent.get('/api/time-off/off').query({ date: '2030-06-11' })).body.employeeIds).toEqual([employee.id]);
    expect((await admin.agent.get('/api/time-off/off').query({ date: END })).body.employeeIds).toEqual([employee.id]);
    expect((await admin.agent.get('/api/time-off/off').query({ date: '2030-06-13' })).body.employeeIds).toEqual([]);
  });

  it("lists the coach's already-scheduled shifts in range as conflicts", async () => {
    const { admin, employee, coach } = await setup('TO8');
    const staff = await makeStaffRow(admin.agent);
    await admin.agent.post('/api/shifts/bulk').send({
      date: '2030-06-11',
      startTime: '16:00',
      endTime: '17:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [employee.id] }],
    });
    await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END });

    const [req] = (await admin.agent.get('/api/time-off')).body.requests;
    expect(req.conflicts).toEqual([
      expect.objectContaining({ date: '2030-06-11', startTime: '16:00', endTime: '17:00', locationName: 'Rink A', subRowLabel: 'Coach' }),
    ]);
  });

  it("hides another campus's employees' requests from a restricted Director", async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'TO9' });
    const campusB = await createCampus(workspace.id, 'Campus B');
    await adminAgent.post('/api/employees').send({ name: 'B Coach', pin: '3333', campusIds: [campusB.id] });
    const bCoach = await loginEmployee(app, 'TO9', '3333');
    const req = (await bCoach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END })).body;

    const campusA = await createCampus(workspace.id, 'Campus A');
    const director = await seedAdminWithRole(app, workspace.id, 'dir@to9.example', 'DIRECTOR', { campusId: campusA.id });

    expect((await director.get('/api/time-off')).body.requests).toHaveLength(0);
    expect((await director.get('/api/time-off/pending-count')).body.count).toBe(0);
    expect((await director.post(`/api/time-off/${req.id}/approve`)).status).toBe(404);
    expect((await adminAgent.get('/api/time-off')).body.requests).toHaveLength(1);
  });
});

describe('approved time off blocks STAFF assignment', () => {
  it('drops an off coach from bulk and cell-PATCH assignment in range, but not outside it', async () => {
    const { admin, employee, coach } = await setup('TO10');
    const staff = await makeStaffRow(admin.agent);
    const r = (await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END })).body;
    await admin.agent.post(`/api/time-off/${r.id}/approve`);

    const inRange = await admin.agent.post('/api/shifts/bulk').send({
      date: '2030-06-11',
      startTime: '16:00',
      endTime: '17:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [employee.id] }],
    });
    const inRangeCellId = inRange.body.created[0].cellValueId;
    const shiftsInRange = (await admin.agent.get('/api/shifts').query({ date: '2030-06-11' })).body.shifts;
    expect(shiftsInRange[0].cellValues[0].staffAssignments).toHaveLength(0);

    const patched = await admin.agent.patch(`/api/shifts/cells/${inRangeCellId}`).send({ staffEmployeeIds: [employee.id] });
    expect(patched.body.staffAssignments).toHaveLength(0);

    await admin.agent.post('/api/shifts/bulk').send({
      date: '2030-06-13',
      startTime: '16:00',
      endTime: '17:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [employee.id] }],
    });
    const shiftsOutside = (await admin.agent.get('/api/shifts').query({ date: '2030-06-13' })).body.shifts;
    expect(shiftsOutside[0].cellValues[0].staffAssignments).toHaveLength(1);
  });

  it('a pending or denied request does not block assignment', async () => {
    const { admin, employee, coach } = await setup('TO11');
    const staff = await makeStaffRow(admin.agent);
    await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END });

    await admin.agent.post('/api/shifts/bulk').send({
      date: '2030-06-11',
      startTime: '16:00',
      endTime: '17:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [employee.id] }],
    });
    const shifts = (await admin.agent.get('/api/shifts').query({ date: '2030-06-11' })).body.shifts;
    expect(shifts[0].cellValues[0].staffAssignments).toHaveLength(1);
  });
});

it('deleting an employee also deletes their time-off requests', async () => {
  const { admin, employee, coach } = await setup('TO12');
  await coach.agent.post('/api/my/time-off').send({ startDate: START, endDate: END });
  expect((await admin.agent.delete(`/api/employees/${employee.id}`)).status).toBe(200);
  expect((await admin.agent.get('/api/time-off')).body.requests).toHaveLength(0);
});
