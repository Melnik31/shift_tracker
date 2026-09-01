import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole } from '../testUtils/authHelpers';

const app = createApp();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// File-upload tests write into the real server/uploads dir (the route
// hardcodes that path). Track every path we create and unlink it afterward
// so the test suite never leaves artifacts next to real seeded demo files.
const uploadedPaths: string[] = [];

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  for (const p of uploadedPaths.splice(0)) {
    fs.rm(p, { force: true }, () => {});
  }
});

async function makeStatusSubRow(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
  const section = (await agent.post('/api/layout/sections').send({ name: 'S' })).body;
  const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'L' })).body;
  return (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Status', dataType: 'STATUS' })).body;
}

describe('shifts CRUD', () => {
  it('creates a shift with an empty cell value, then reads it back by date', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);

    const created = await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' });
    expect(created.status).toBe(201);
    expect(created.body.cellValues).toHaveLength(1);

    const listed = await agent.get('/api/shifts').query({ date: '2026-08-17' });
    expect(listed.body.shifts).toHaveLength(1);
    expect(listed.body.shifts[0].startTime).toBe('09:00');

    const otherDate = await agent.get('/api/shifts').query({ date: '2026-08-18' });
    expect(otherDate.body.shifts).toHaveLength(0);
  });

  it('rejects a shift for a subrow that does not belong to the caller', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.post('/api/shifts').send({ subRowId: 'nope', date: '2026-08-17', startTime: '09:00', endTime: '17:00' });
    expect(res.status).toBe(404);
  });

  it('requires date/startTime/endTime', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const res = await agent.post('/api/shifts').send({ subRowId: subRow.id });
    expect(res.status).toBe(400);
  });

  it('updates shift times', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;

    const patched = await agent.patch(`/api/shifts/${shift.id}`).send({ startTime: '10:00' });
    expect(patched.status).toBe(200);
    expect(patched.body.startTime).toBe('10:00');
    expect(patched.body.endTime).toBe('17:00');
  });

  it('creates a shift without a sessionType and leaves it null', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const created = await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' });
    expect(created.status).toBe(201);
    expect(created.body.sessionType).toBeNull();
  });

  it('creates a shift with a valid sessionType and rejects an invalid one', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);

    const valid = await agent
      .post('/api/shifts')
      .send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00', sessionType: 'Workout' });
    expect(valid.status).toBe(201);
    expect(valid.body.sessionType).toBe('Workout');

    const invalid = await agent
      .post('/api/shifts')
      .send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00', sessionType: 'Bogus' });
    expect(invalid.status).toBe(400);
  });

  it('updates a shift sessionType, and can clear it back to null', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;

    const patched = await agent.patch(`/api/shifts/${shift.id}`).send({ sessionType: 'Skill Session' });
    expect(patched.status).toBe(200);
    expect(patched.body.sessionType).toBe('Skill Session');

    const invalidPatch = await agent.patch(`/api/shifts/${shift.id}`).send({ sessionType: 'Bogus' });
    expect(invalidPatch.status).toBe(400);

    const cleared = await agent.patch(`/api/shifts/${shift.id}`).send({ sessionType: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.sessionType).toBeNull();
  });

  it('deletes a shift and its cell value', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;

    expect((await agent.delete(`/api/shifts/${shift.id}`)).status).toBe(200);
    expect((await agent.get('/api/shifts').query({ date: '2026-08-17' })).body.shifts).toHaveLength(0);
  });

  it('404s patching/deleting a shift id that does not exist', async () => {
    const { agent } = await signupAdmin(app);
    expect((await agent.patch('/api/shifts/does-not-exist').send({ startTime: '10:00' })).status).toBe(404);
    expect((await agent.delete('/api/shifts/does-not-exist')).status).toBe(404);
  });
});

describe('cell value updates', () => {
  it('sets STATUS, BADGE, TEXT, and LINK fields on a cell value', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellId = shift.cellValues[0].id;

    const res = await agent.patch(`/api/shifts/cells/${cellId}`).send({
      statusValue: 'IN_PROGRESS',
      badgeLabel: 'Headliner',
      badgeColor: '#ef4444',
      textValue: 'Setup notes',
      linkUrl: 'https://example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.statusValue).toBe('IN_PROGRESS');
    expect(res.body.badgeLabel).toBe('Headliner');
    expect(res.body.textValue).toBe('Setup notes');
    expect(res.body.linkUrl).toBe('https://example.com');
  });

  it('rejects an invalid statusValue', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;

    const res = await agent.patch(`/api/shifts/cells/${shift.cellValues[0].id}`).send({ statusValue: 'NOT_REAL' });
    expect(res.status).toBe(400);
  });

  it('404s patching a cell value id that does not exist', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.patch('/api/shifts/cells/does-not-exist').send({ textValue: 'x' });
    expect(res.status).toBe(404);
  });

  it('assigns and clears staff on a STAFF cell', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'S' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'L' })).body;
    const subRow = (
      await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Staff', dataType: 'STAFF' })
    ).body;
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellId = shift.cellValues[0].id;

    const emp1 = (await agent.post('/api/employees').send({ name: 'Emp One', pin: '1111' })).body;
    const emp2 = (await agent.post('/api/employees').send({ name: 'Emp Two', pin: '2222' })).body;

    const assigned = await agent.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [emp1.id, emp2.id] });
    expect(assigned.status).toBe(200);
    expect(assigned.body.staffAssignments.map((a: { employee: { id: string } }) => a.employee.id).sort()).toEqual(
      [emp1.id, emp2.id].sort()
    );

    const cleared = await agent.patch(`/api/shifts/cells/${cellId}`).send({ staffEmployeeIds: [] });
    expect(cleared.body.staffAssignments).toHaveLength(0);
  });
});

describe('file uploads on cell values', () => {
  it('uploads a file, lists it on the cell, then deletes it from DB and disk', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellId = shift.cellValues[0].id;

    const upload = await agent
      .post(`/api/shifts/cells/${cellId}/files`)
      .attach('file', Buffer.from('hello world'), 'notes.txt');
    expect(upload.status).toBe(201);
    expect(upload.body.filename).toBe('notes.txt');

    const diskPath = path.join(UPLOAD_DIR, path.basename(upload.body.url));
    uploadedPaths.push(diskPath);
    expect(fs.existsSync(diskPath)).toBe(true);

    const withFile = await agent.get('/api/shifts').query({ date: '2026-08-17' });
    expect(withFile.body.shifts[0].cellValues[0].fileUploads).toHaveLength(1);

    const del = await agent.delete(`/api/shifts/files/${upload.body.id}`);
    expect(del.status).toBe(200);
    expect(fs.existsSync(diskPath)).toBe(false);

    const withoutFile = await agent.get('/api/shifts').query({ date: '2026-08-17' });
    expect(withoutFile.body.shifts[0].cellValues[0].fileUploads).toHaveLength(0);
  });

  it('rejects an upload with no file attached', async () => {
    const { agent } = await signupAdmin(app);
    const subRow = await makeStatusSubRow(agent);
    const shift = (
      await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;

    const res = await agent.post(`/api/shifts/cells/${shift.cellValues[0].id}/files`);
    expect(res.status).toBe(400);
  });

  it('404s deleting a file id that does not exist', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.delete('/api/shifts/files/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('bulk shift creation (New Shift Block)', () => {
  async function makeBlockLocation(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const status = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Status', dataType: 'STATUS' })).body;
    const text = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Notes', dataType: 'TEXT' })).body;
    const badge = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Level', dataType: 'BADGE' })).body;
    const staff = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Staff', dataType: 'STAFF' })).body;
    return { location, status, text, badge, staff };
  }

  it('creates a shift only for rows that were actually filled in, skipping blank ones', async () => {
    const { agent } = await signupAdmin(app);
    const { status, text, badge, staff } = await makeBlockLocation(agent);

    const res = await agent.post('/api/shifts/bulk').send({
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      sessionType: 'Workout',
      rows: [
        { subRowId: status.id, statusValue: 'SCHEDULED' },
        { subRowId: text.id, textValue: 'Bring extra pucks' },
        { subRowId: badge.id, badgeLabel: '' }, // blank
        { subRowId: staff.id, staffEmployeeIds: [] }, // blank
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created.map((c: { subRowId: string }) => c.subRowId).sort()).toEqual([status.id, text.id].sort());
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped.find((s: { subRowId: string }) => s.subRowId === badge.id).reason).toBe('Nothing entered');
    expect(res.body.skipped.find((s: { subRowId: string }) => s.subRowId === staff.id).reason).toBe('Nothing entered');

    const shifts = (await agent.get('/api/shifts').query({ date: '2026-09-01' })).body.shifts;
    expect(shifts).toHaveLength(2);
  });

  it('excludes a row from creation when a shift already overlaps that date/time on that SubRow, without touching the existing one', async () => {
    const { agent } = await signupAdmin(app);
    const { status, text } = await makeBlockLocation(agent);

    const existing = await agent
      .post('/api/shifts')
      .send({ subRowId: status.id, date: '2026-09-01', startTime: '10:00', endTime: '11:00' });
    const existingCellValueId = existing.body.cellValues[0].id;
    await agent.patch(`/api/shifts/cells/${existingCellValueId}`).send({ statusValue: 'IN_PROGRESS' });

    const res = await agent.post('/api/shifts/bulk').send({
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00', // overlaps the existing 10:00-11:00 shift on `status`
      rows: [
        { subRowId: status.id, statusValue: 'SCHEDULED' },
        { subRowId: text.id, textValue: 'Fine, no conflict here' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created.map((c: { subRowId: string }) => c.subRowId)).toEqual([text.id]);
    expect(res.body.skipped).toEqual([{ subRowId: status.id, reason: 'Already scheduled' }]);

    // The pre-existing shift on `status` was never overwritten.
    const shifts = (await agent.get('/api/shifts').query({ date: '2026-09-01' })).body.shifts;
    const statusShift = shifts.find((s: { subRowId: string }) => s.subRowId === status.id);
    expect(statusShift.startTime).toBe('10:00');
    expect(statusShift.cellValues[0].statusValue).toBe('IN_PROGRESS');
    expect(shifts).toHaveLength(2); // the untouched existing one + the new text shift
  });

  it('gives every created shift the same date/startTime/endTime/sessionType', async () => {
    const { agent } = await signupAdmin(app);
    const { status, text, badge } = await makeBlockLocation(agent);

    const res = await agent.post('/api/shifts/bulk').send({
      date: '2026-09-03',
      startTime: '08:30',
      endTime: '10:00',
      sessionType: 'Ice Session',
      rows: [
        { subRowId: status.id, statusValue: 'SCHEDULED' },
        { subRowId: text.id, textValue: 'Warm-up drills' },
        { subRowId: badge.id, badgeLabel: 'High', badgeColor: '#3b82f6' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(3);

    const shifts = (await agent.get('/api/shifts').query({ date: '2026-09-03' })).body.shifts;
    expect(shifts).toHaveLength(3);
    for (const s of shifts) {
      expect(s.date).toBe('2026-09-03');
      expect(s.startTime).toBe('08:30');
      expect(s.endTime).toBe('10:00');
      expect(s.sessionType).toBe('Ice Session');
    }
  });

  it('creates STAFF assignments for a filled STAFF row and silently drops a cross-workspace employee id', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'BULK1' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'BULK2' });
    const { staff } = await makeBlockLocation(a);
    const ownEmployee = (await a.post('/api/employees').send({ name: 'Own Emp', pin: '1111' })).body;
    const otherEmployee = (await b.post('/api/employees').send({ name: 'Other Emp', pin: '2222' })).body;

    const res = await a.post('/api/shifts/bulk').send({
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      rows: [{ subRowId: staff.id, staffEmployeeIds: [ownEmployee.id, otherEmployee.id] }],
    });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);

    const shifts = (await a.get('/api/shifts').query({ date: '2026-09-01' })).body.shifts;
    const assignments = shifts[0].cellValues[0].staffAssignments;
    expect(assignments.map((x: { employee: { id: string } }) => x.employee.id)).toEqual([ownEmployee.id]);
  });

  it('skips a subRowId that does not belong to the caller\'s workspace, and rejects an empty rows array', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'BULK3' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'BULK4' });
    const { status: bStatus } = await makeBlockLocation(b);

    const res = await a.post('/api/shifts/bulk').send({
      date: '2026-09-01',
      startTime: '09:00',
      endTime: '17:00',
      rows: [{ subRowId: bStatus.id, statusValue: 'SCHEDULED' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.skipped).toEqual([{ subRowId: bStatus.id, reason: 'SubRow not found' }]);

    const empty = await a.post('/api/shifts/bulk').send({ date: '2026-09-01', startTime: '09:00', endTime: '17:00', rows: [] });
    expect(empty.status).toBe(400);
  });
});

describe('shifts role gating (requireRole DIRECTOR/ADMIN/CEO)', () => {
  it('404s a COACH session (employee login) on both a read and a mutation route', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'SROLE1' });
    const subRow = await makeStatusSubRow(agent);
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await coachAgent.get('/api/shifts').query({ date: '2026-08-17' })).status).toBe(404);
    expect((await coachAgent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })).status).toBe(
      404
    );
  });

  it('DIRECTOR, ADMIN, and CEO all succeed identically', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'SROLE2' });
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@srole2.example', 'DIRECTOR');
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@srole2.example', 'CEO');
    const subRow = await makeStatusSubRow(adminAgent);

    const dates = { admin: '2026-08-01', director: '2026-08-02', ceo: '2026-08-03' } as const;
    for (const [label, agent] of [
      ['admin', adminAgent],
      ['director', directorAgent],
      ['ceo', ceoAgent],
    ] as const) {
      expect((await agent.get('/api/shifts').query({ date: '2026-08-17' })).status).toBe(200);
      const created = await agent.post('/api/shifts').send({ subRowId: subRow.id, date: dates[label], startTime: '09:00', endTime: '17:00' });
      expect(created.status).toBe(201);
      expect((await agent.patch(`/api/shifts/${created.body.id}`).send({ startTime: '10:00' })).status).toBe(200);
      expect((await agent.delete(`/api/shifts/${created.body.id}`)).status).toBe(200);
    }
  });
});
