import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

async function makeStaffSubRow(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
  const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
  const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
  return (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Staff', dataType: 'STAFF' })).body;
}

async function createAssignedShift(
  agent: Awaited<ReturnType<typeof signupAdmin>>['agent'],
  opts: { subRowId: string; date: string; startTime: string; endTime: string; employeeId: string; sessionType?: string; cancelled?: boolean }
) {
  const shift = (
    await agent
      .post('/api/shifts')
      .send({ subRowId: opts.subRowId, date: opts.date, startTime: opts.startTime, endTime: opts.endTime, sessionType: opts.sessionType })
  ).body;
  const cellValueId = shift.cellValues[0].id;
  await agent.patch(`/api/shifts/cells/${cellValueId}`).send({ staffEmployeeIds: [opts.employeeId] });
  if (opts.cancelled) {
    await agent.patch(`/api/shifts/${shift.id}`).send({ cancelled: true });
  }
  return shift;
}

describe('payroll period CRUD', () => {
  it('creates a period defaulting to OPEN and lists it', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY1' });
    const created = await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('OPEN');

    const listed = await agent.get('/api/payroll/periods');
    expect(listed.body.periods).toHaveLength(1);
    expect(listed.body.periods[0].id).toBe(created.body.id);
  });

  it('rejects start after end', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY2' });
    const res = await agent.post('/api/payroll/periods').send({ start: '2026-09-14', end: '2026-09-01' });
    expect(res.status).toBe(400);
  });

  it('rejects a period overlapping an existing one', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY3' });
    await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' });
    const res = await agent.post('/api/payroll/periods').send({ start: '2026-09-10', end: '2026-09-20' });
    expect(res.status).toBe(409);
  });
});

describe('payroll period status transitions', () => {
  it('goes OPEN -> REVIEWED -> APPROVED on the happy path', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY4' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    const reviewed = await agent.post(`/api/payroll/periods/${period.id}/review`);
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe('REVIEWED');

    const approved = await agent.post(`/api/payroll/periods/${period.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
  });

  it('rejects approve before review, and review twice', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY5' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await agent.post(`/api/payroll/periods/${period.id}/approve`)).status).toBe(409);

    await agent.post(`/api/payroll/periods/${period.id}/review`);
    expect((await agent.post(`/api/payroll/periods/${period.id}/review`)).status).toBe(409);
  });
});

describe('requireRole(ADMIN, CEO) gate on payroll routes', () => {
  it('404s a COACH session (employee login) on both a read and a mutation route', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'PAY6' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: empAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await empAgent.get('/api/payroll/periods')).status).toBe(404);
    expect((await empAgent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).status).toBe(404);
  });

  it('404s a DIRECTOR-role admin session on both a read and a mutation route', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'PAY7' });
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@pay7.example', 'DIRECTOR');
    const period = (await adminAgent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await directorAgent.get('/api/payroll/periods')).status).toBe(404);
    expect((await directorAgent.post(`/api/payroll/periods/${period.id}/review`)).status).toBe(404);
  });

  it('allows the default ADMIN-role session', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY8' });
    expect((await agent.get('/api/payroll/periods')).status).toBe(200);
  });

  it('CEO gets identical, full (not read-only) access — through the whole period lifecycle', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'PAY9CEO' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@pay9.example', 'CEO');
    const employee = (await adminAgent.post('/api/employees').send({ name: 'CEO Test Emp', pin: '3333' })).body;

    // CEO can create, read, and progress a period through review/approve.
    const created = await ceoAgent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' });
    expect(created.status).toBe(201);
    const periodId = created.body.id;
    expect((await ceoAgent.get(`/api/payroll/periods/${periodId}`)).status).toBe(200);
    expect((await ceoAgent.post(`/api/payroll/periods/${periodId}/review`)).status).toBe(200);
    expect((await ceoAgent.post(`/api/payroll/periods/${periodId}/approve`)).status).toBe(200);

    // CEO can export the CSV once approved.
    expect((await ceoAgent.get(`/api/payroll/periods/${periodId}/export`)).status).toBe(200);

    // CEO can create an adjustment (a mutation, not read-only).
    const adjustment = await ceoAgent
      .post(`/api/payroll/periods/${periodId}/adjustments`)
      .send({ employeeId: employee.id, deltaMinutes: 30, reason: 'CEO correction' });
    expect(adjustment.status).toBe(201);
    expect((await ceoAgent.get(`/api/payroll/periods/${periodId}/adjustments`)).status).toBe(200);

    // CEO can reopen an APPROVED period (also a mutation).
    const reopened = await ceoAgent.post(`/api/payroll/periods/${periodId}/reopen`).send({ reason: 'CEO reopen test' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe('OPEN');
    expect((await ceoAgent.get(`/api/payroll/periods/${periodId}/reopens`)).status).toBe(200);

    // CEO can delete a period.
    expect((await ceoAgent.delete(`/api/payroll/periods/${periodId}`)).status).toBe(200);
  });
});

describe('payroll period review detail: payable hours + exceptions', () => {
  it('computes payable hours and flags missing type, overlaps, cancelled, and high hours', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY9' });
    const subRow = await makeStaffSubRow(agent);
    const employee = (await agent.post('/api/employees').send({ name: 'Alice', pin: '2222' })).body;

    // Day 1: shiftA missing sessionType, overlaps shiftB (09:00-13:00 vs 12:00-14:00) -> 6h billable that day.
    const shiftA = await createAssignedShift(agent, { subRowId: subRow.id, date: '2026-09-01', startTime: '09:00', endTime: '13:00', employeeId: employee.id });
    await createAssignedShift(agent, { subRowId: subRow.id, date: '2026-09-01', startTime: '12:00', endTime: '14:00', employeeId: employee.id, sessionType: 'Workout' });

    // Day 2: one 13h shift (over the 12h placeholder threshold) + one cancelled shift excluded from hours.
    await createAssignedShift(agent, { subRowId: subRow.id, date: '2026-09-02', startTime: '06:00', endTime: '19:00', employeeId: employee.id, sessionType: 'Ice Session' });
    await createAssignedShift(agent, { subRowId: subRow.id, date: '2026-09-02', startTime: '06:00', endTime: '08:00', employeeId: employee.id, cancelled: true });

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-02' })).body;
    const detail = (await agent.get(`/api/payroll/periods/${period.id}`)).body;

    const alice = detail.employees.find((e: { employeeId: string }) => e.employeeId === employee.id);
    expect(alice).toBeDefined();
    expect(alice.payableHours).toBe(19);
    expect(alice.adjustmentHours).toBe(0);
    expect(alice.totalPayableHours).toBe(19);

    function countKind(kind: string) {
      return alice.exceptions.filter((e: { kind: string }) => e.kind === kind).length;
    }
    expect(countKind('MISSING_SESSION_TYPE')).toBe(1);
    expect(countKind('OVERLAPPING_SHIFTS')).toBe(1);
    expect(countKind('CANCELLED_SESSION')).toBe(1);
    expect(countKind('HIGH_HOURS')).toBe(1);
    expect(countKind('LOW_HOURS')).toBe(0);
    expect(alice.exceptions.find((e: { kind: string; shiftId?: string }) => e.kind === 'MISSING_SESSION_TYPE').shiftId).toBe(shiftA.id);
  });

  it('404s a period id that does not exist or belongs to another workspace', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'PAY10A' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'PAY10B' });
    const period = (await a.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await a.get('/api/payroll/periods/does-not-exist')).status).toBe(404);
    expect((await b.get(`/api/payroll/periods/${period.id}`)).status).toBe(404);
  });
});

describe('payroll adjustments', () => {
  it('creates an adjustment, lists it, and folds it into totalPayableHours', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY11' });
    const subRow = await makeStaffSubRow(agent);
    const employee = (await agent.post('/api/employees').send({ name: 'Bea', pin: '3333' })).body;
    await createAssignedShift(agent, { subRowId: subRow.id, date: '2026-09-01', startTime: '09:00', endTime: '17:00', employeeId: employee.id, sessionType: 'Workout' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;

    const created = await agent
      .post(`/api/payroll/periods/${period.id}/adjustments`)
      .send({ employeeId: employee.id, deltaMinutes: 60, reason: 'Missed clock-in correction' });
    expect(created.status).toBe(201);
    expect(created.body.employee.name).toBe('Bea');
    expect(created.body.createdByAdmin.email).toBeTruthy();

    const listed = await agent.get(`/api/payroll/periods/${period.id}/adjustments`);
    expect(listed.body.adjustments).toHaveLength(1);

    const detail = (await agent.get(`/api/payroll/periods/${period.id}`)).body;
    const bea = detail.employees.find((e: { employeeId: string }) => e.employeeId === employee.id);
    expect(bea.payableHours).toBe(8);
    expect(bea.adjustmentHours).toBe(1);
    expect(bea.totalPayableHours).toBe(9);
  });

  it('validates employee ownership, nonzero deltaMinutes, and a reason', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PAY12' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await agent.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: 'nope', deltaMinutes: 30, reason: 'x' })).status).toBe(404);

    const employee = (await agent.post('/api/employees').send({ name: 'Cam', pin: '4444' })).body;
    expect((await agent.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: employee.id, deltaMinutes: 0, reason: 'x' })).status).toBe(400);
    expect((await agent.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: employee.id, deltaMinutes: 30 })).status).toBe(400);
  });

  it('tenant isolation: workspace B cannot create or list adjustments on workspace A\'s period', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'PAY13A' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'PAY13B' });
    const period = (await a.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;
    const bEmployee = (await b.post('/api/employees').send({ name: 'B Emp', pin: '5555' })).body;

    expect((await b.get(`/api/payroll/periods/${period.id}/adjustments`)).status).toBe(404);
    expect(
      (await b.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: bEmployee.id, deltaMinutes: 30, reason: 'x' })).status
    ).toBe(404);
  });
});

describe('payroll lock enforcement on shift routes', () => {
  async function setupApprovedPeriod() {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'PAY14' });
    const subRow = await makeStaffSubRow(agent);
    const employee = (await agent.post('/api/employees').send({ name: 'Locked Emp', pin: '6666' })).body;
    const shift = await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      employeeId: employee.id,
      sessionType: 'Workout',
    });
    const cellValueId = shift.cellValues[0].id;

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);

    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@pay14.example', 'DIRECTOR');
    return { adminAgent: agent, directorAgent, subRow, shift, cellValueId };
  }

  it('blocks a DIRECTOR-role admin from editing a locked shift directly', async () => {
    const { directorAgent, shift, cellValueId } = await setupApprovedPeriod();

    expect((await directorAgent.patch(`/api/shifts/${shift.id}`).send({ startTime: '08:00' })).status).toBe(409);
    expect((await directorAgent.patch(`/api/shifts/cells/${cellValueId}`).send({ textValue: 'x' })).status).toBe(409);
    expect((await directorAgent.delete(`/api/shifts/${shift.id}`)).status).toBe(409);
  });

  it('still allows the ADMIN-role session to edit the same locked shift', async () => {
    const { adminAgent, shift } = await setupApprovedPeriod();

    const res = await adminAgent.patch(`/api/shifts/${shift.id}`).send({ startTime: '08:00' });
    expect(res.status).toBe(200);
    expect(res.body.startTime).toBe('08:00');
  });

  it('leaves shifts outside the approved period date range editable by anyone', async () => {
    const { directorAgent, subRow } = await setupApprovedPeriod();
    const employee = (await directorAgent.post('/api/employees').send({ name: 'Outside', pin: '7777' })).body;
    const outsideShift = await createAssignedShift(directorAgent, {
      subRowId: subRow.id,
      date: '2026-09-05',
      startTime: '09:00',
      endTime: '17:00',
      employeeId: employee.id,
    });

    const res = await directorAgent.patch(`/api/shifts/${outsideShift.id}`).send({ startTime: '10:00' });
    expect(res.status).toBe(200);
  });

  it('blocks creating a new shift on a locked date for non-ADMIN roles', async () => {
    const { directorAgent, subRow } = await setupApprovedPeriod();
    const res = await directorAgent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-09-01', startTime: '10:00', endTime: '11:00' });
    expect(res.status).toBe(409);
  });
});

describe('reopening an approved period', () => {
  async function setupApprovedPeriod(workspaceCode: string) {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode });
    const subRow = await makeStaffSubRow(agent);
    const employee = (await agent.post('/api/employees').send({ name: 'Reopen Emp', pin: '9999' })).body;
    const shift = await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      employeeId: employee.id,
      sessionType: 'Workout',
    });

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);

    return { agent, workspace, period, shift };
  }

  it('reopens an APPROVED period back to OPEN, resetting reviewedAt/approvedAt and logging who/when/why', async () => {
    const { agent, period } = await setupApprovedPeriod('REOPEN1');

    const res = await agent.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: 'Test data, not final' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.reviewedAt).toBeNull();
    expect(res.body.approvedAt).toBeNull();

    const reopens = await agent.get(`/api/payroll/periods/${period.id}/reopens`);
    expect(reopens.body.reopens).toHaveLength(1);
    expect(reopens.body.reopens[0].reason).toBe('Test data, not final');
    expect(reopens.body.reopens[0].createdByAdmin.email).toBeTruthy();
    expect(reopens.body.reopens[0].createdAt).toBeTruthy();
  });

  it('requires a nonempty reason', async () => {
    const { agent, period } = await setupApprovedPeriod('REOPEN2');
    expect((await agent.post(`/api/payroll/periods/${period.id}/reopen`).send({})).status).toBe(400);
    expect((await agent.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: '   ' })).status).toBe(400);
  });

  it('rejects reopening a period that is not APPROVED', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'REOPEN3' });
    const openPeriod = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;
    expect((await agent.post(`/api/payroll/periods/${openPeriod.id}/reopen`).send({ reason: 'x' })).status).toBe(409);

    await agent.post(`/api/payroll/periods/${openPeriod.id}/review`);
    expect((await agent.post(`/api/payroll/periods/${openPeriod.id}/reopen`).send({ reason: 'x' })).status).toBe(409);
  });

  it('404s a DIRECTOR-role admin attempting to reopen', async () => {
    const { workspace, period } = await setupApprovedPeriod('REOPEN4');
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@reopen4.example', 'DIRECTOR');
    expect((await directorAgent.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: 'x' })).status).toBe(404);
  });

  it('tenant isolation: workspace B cannot reopen or view reopen history for workspace A\'s period', async () => {
    const { period } = await setupApprovedPeriod('REOPEN5A');
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'REOPEN5B' });
    expect((await b.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: 'x' })).status).toBe(404);
    expect((await b.get(`/api/payroll/periods/${period.id}/reopens`)).status).toBe(404);
  });

  it('releases the shift lock — a DIRECTOR-role admin can edit again after reopen', async () => {
    const { agent, workspace, period, shift } = await setupApprovedPeriod('REOPEN6');
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@reopen6.example', 'DIRECTOR');

    expect((await directorAgent.patch(`/api/shifts/${shift.id}`).send({ startTime: '10:00' })).status).toBe(409);

    await agent.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: 'Fixing test data' });

    const res = await directorAgent.patch(`/api/shifts/${shift.id}`).send({ startTime: '10:00' });
    expect(res.status).toBe(200);
  });
});

describe('deleting a payroll period', () => {
  it('deletes an OPEN period', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'DEL1' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await agent.delete(`/api/payroll/periods/${period.id}`)).status).toBe(200);
    expect((await agent.get('/api/payroll/periods')).body.periods).toHaveLength(0);
  });

  it('cascades: deleting a period also removes its adjustments and reopen history', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'DEL2' });
    const subRow = await makeStaffSubRow(agent);
    const employee = (await agent.post('/api/employees').send({ name: 'Del Emp', pin: '4321' })).body;
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      employeeId: employee.id,
      sessionType: 'Workout',
    });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: employee.id, deltaMinutes: 30, reason: 'x' });
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);
    await agent.post(`/api/payroll/periods/${period.id}/reopen`).send({ reason: 'y' });

    expect((await agent.delete(`/api/payroll/periods/${period.id}`)).status).toBe(200);

    // The period is gone, but the underlying shift/employee data is untouched.
    expect((await agent.get(`/api/payroll/periods/${period.id}`)).status).toBe(404);
    const shifts = await agent.get('/api/shifts').query({ date: '2026-09-01' });
    expect(shifts.body.shifts).toHaveLength(1);
  });

  it('404s a nonexistent period, and 404s a DIRECTOR-role admin attempting to delete', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'DEL3' });
    expect((await agent.delete('/api/payroll/periods/does-not-exist')).status).toBe(404);

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@del3.example', 'DIRECTOR');
    expect((await directorAgent.delete(`/api/payroll/periods/${period.id}`)).status).toBe(404);

    // Untouched by the denied attempt.
    expect((await agent.get('/api/payroll/periods')).body.periods).toHaveLength(1);
  });

  it('tenant isolation: workspace B cannot delete workspace A\'s period', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'DEL4A' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'DEL4B' });
    const period = (await a.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;

    expect((await b.delete(`/api/payroll/periods/${period.id}`)).status).toBe(404);
    expect((await a.get('/api/payroll/periods')).body.periods).toHaveLength(1);
  });
});

describe('CSV export for an APPROVED period', () => {
  it('returns a CSV with the header, one row per employee, correct total/paid-break/session-type breakdown', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CSV1' });
    const subRow = await makeStaffSubRow(agent);
    const alice = (await agent.post('/api/employees').send({ name: 'Alice Chen', pin: '1111' })).body;

    // Day 1: two shifts with a 15-min qualifying gap between them -> 0.25h paid break.
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '13:00',
      employeeId: alice.id,
      sessionType: 'Workout',
    });
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '13:15',
      endTime: '14:15',
      employeeId: alice.id,
      sessionType: 'Skill Session',
    });
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-02',
      startTime: '09:00',
      endTime: '11:00',
      employeeId: alice.id,
      sessionType: 'Ice Session',
    });
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-02',
      startTime: '14:00',
      endTime: '15:00',
      employeeId: alice.id,
      cancelled: true,
    });

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-02' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/adjustments`).send({ employeeId: alice.id, deltaMinutes: 30, reason: 'Correction' });
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);

    const res = await agent.get(`/api/payroll/periods/${period.id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('payroll-2026-09-01-to-2026-09-02.csv');

    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Employee Name,Period Start,Period End,Total Payable Hours,Paid Break Hours,Ice Session Hours,Skill Session Hours,Workout Hours,Association Hours,No Session Type Hours'
    );
    expect(lines).toHaveLength(2);

    const cols = lines[1].split(',');
    expect(cols[0]).toBe('Alice Chen');
    expect(cols[1]).toBe('2026-09-01');
    expect(cols[2]).toBe('2026-09-02');
    // 4h Workout + 1h Skill Session + 0.25h paid break + 2h Ice Session + 0.5h adjustment; cancelled shift excluded
    expect(cols[3]).toBe('7.75');
    expect(cols[4]).toBe('0.25'); // Paid Break Hours
    expect(cols[5]).toBe('2'); // Ice Session
    expect(cols[6]).toBe('1'); // Skill Session
    expect(cols[7]).toBe('4'); // Workout
    expect(cols[8]).toBe('0'); // Association
    expect(cols[9]).toBe('0'); // No Session Type
  });

  it('409s when the period is not APPROVED', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CSV2' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;
    expect((await agent.get(`/api/payroll/periods/${period.id}/export`)).status).toBe(409);

    await agent.post(`/api/payroll/periods/${period.id}/review`);
    expect((await agent.get(`/api/payroll/periods/${period.id}/export`)).status).toBe(409);
  });

  it('404s a nonexistent or cross-tenant period', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'CSV3A' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'CSV3B' });
    expect((await a.get('/api/payroll/periods/does-not-exist/export')).status).toBe(404);

    const period = (await a.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;
    await a.post(`/api/payroll/periods/${period.id}/review`);
    await a.post(`/api/payroll/periods/${period.id}/approve`);
    expect((await b.get(`/api/payroll/periods/${period.id}/export`)).status).toBe(404);
  });

  it('404s a DIRECTOR-role admin', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'CSV4' });
    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-14' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);

    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@csv4.example', 'DIRECTOR');
    expect((await directorAgent.get(`/api/payroll/periods/${period.id}/export`)).status).toBe(404);
  });

  it('escapes an employee name containing a comma', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CSV5' });
    const subRow = await makeStaffSubRow(agent);
    const emp = (await agent.post('/api/employees').send({ name: 'Chen, Alice', pin: '2222' })).body;
    await createAssignedShift(agent, {
      subRowId: subRow.id,
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '10:00',
      employeeId: emp.id,
      sessionType: 'Workout',
    });

    const period = (await agent.post('/api/payroll/periods').send({ start: '2026-09-01', end: '2026-09-01' })).body;
    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);

    const res = await agent.get(`/api/payroll/periods/${period.id}/export`);
    expect(res.text).toContain('"Chen, Alice"');
  });
});
