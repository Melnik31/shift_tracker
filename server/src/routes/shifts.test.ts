import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin } from '../testUtils/authHelpers';

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
