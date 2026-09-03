import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, seedAdminWithRole, getDefaultCampus, createCampus } from '../testUtils/authHelpers';

// Campus is the second scoping dimension alongside workspace (see
// tenantIsolation.test.ts for the first): ADMIN/CEO see every Campus in the
// workspace, DIRECTOR/SENIOR_LEAD_INSTRUCTOR only the one Campus recorded on their session.
// This suite pins that contract down for layout, shifts, and employees —
// analytics is deliberately unscoped by an employee's own campus, since it
// already filters by *where the shift is* (see dayOverview.ts) — following
// the same 404-not-403 convention as tenantIsolation.test.ts: a resource
// outside the caller's Campus must look identical to one that doesn't exist.
//
// Employee.campusId is nullable (unlike Section's required campusId): null
// means the Employee "floats" across every Campus, visible/assignable
// everywhere — see the schema comment on Employee.campusId and
// routes/employees.ts.

const app = createApp();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const uploadedPaths: string[] = [];

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  for (const p of uploadedPaths.splice(0)) {
    fs.rm(p, { force: true }, () => {});
  }
});

async function setupTwoCampuses(workspaceCode: string) {
  const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode });
  const campusA = await getDefaultCampus(workspace.id);
  const campusB = await createCampus(workspace.id, 'Campus B');

  const sectionA = (await adminAgent.post('/api/layout/sections').send({ name: 'A Section' })).body;
  const sectionB = (await adminAgent.post('/api/layout/sections').send({ name: 'B Section', campusId: campusB.id })).body;

  const locationA = (await adminAgent.post('/api/layout/locations').send({ sectionId: sectionA.id, name: 'A Location' })).body;
  const locationB = (await adminAgent.post('/api/layout/locations').send({ sectionId: sectionB.id, name: 'B Location' })).body;

  const subRowA = (await adminAgent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Status', dataType: 'STATUS' })).body;
  const subRowB = (await adminAgent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Status', dataType: 'STATUS' })).body;
  const fileSubRowA = (await adminAgent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Files', dataType: 'FILE' })).body;

  const directorA = await seedAdminWithRole(app, workspace.id, `director-a@${workspaceCode}.example`, 'DIRECTOR', { campusId: campusA.id });
  const directorB = await seedAdminWithRole(app, workspace.id, `director-b@${workspaceCode}.example`, 'DIRECTOR', { campusId: campusB.id });
  const sliA = await seedAdminWithRole(app, workspace.id, `sli-a@${workspaceCode}.example`, 'SENIOR_LEAD_INSTRUCTOR', { campusId: campusA.id });

  return { adminAgent, workspace, campusA, campusB, sectionA, sectionB, locationA, locationB, subRowA, subRowB, fileSubRowA, directorA, directorB, sliA };
}

describe('campus isolation — layout', () => {
  it('GET /api/layout returns only the caller Campus for a scoped DIRECTOR/SENIOR_LEAD_INSTRUCTOR, but every Campus for ADMIN', async () => {
    const { adminAgent, directorA, directorB, sliA } = await setupTwoCampuses('CAMPLAY1');

    const admin = await adminAgent.get('/api/layout');
    expect(admin.body.sections.map((s: any) => s.name).sort()).toEqual(['A Section', 'B Section']);

    const dirA = await directorA.get('/api/layout');
    expect(dirA.body.sections.map((s: any) => s.name)).toEqual(['A Section']);

    const dirB = await directorB.get('/api/layout');
    expect(dirB.body.sections.map((s: any) => s.name)).toEqual(['B Section']);

    const sli = await sliA.get('/api/layout');
    expect(sli.body.sections.map((s: any) => s.name)).toEqual(['A Section']);
  });

  it('a DIRECTOR from Campus A cannot read, patch, or delete a Section in Campus B, while ADMIN can do both', async () => {
    const { adminAgent, directorA, sectionB } = await setupTwoCampuses('CAMPLAY2');

    expect((await directorA.patch(`/api/layout/sections/${sectionB.id}`).send({ name: 'hijacked' })).status).toBe(404);
    expect((await directorA.delete(`/api/layout/sections/${sectionB.id}`)).status).toBe(404);
    expect((await directorA.post(`/api/layout/sections/${sectionB.id}/move`).send({ direction: 'up' })).status).toBe(404);

    const patched = await adminAgent.patch(`/api/layout/sections/${sectionB.id}`).send({ name: 'still B' });
    expect(patched.status).toBe(200);
  });

  it('a DIRECTOR from Campus A cannot create a Location under a Campus B Section', async () => {
    const { directorA, sectionB } = await setupTwoCampuses('CAMPLAY3');

    const res = await directorA.post('/api/layout/locations').send({ sectionId: sectionB.id, name: 'Sneaky' });
    expect(res.status).toBe(404);
  });

  it('a DIRECTOR from Campus A cannot patch, delete, or move a Location/SubRow that lives in Campus B', async () => {
    const { directorA, locationB, subRowB } = await setupTwoCampuses('CAMPLAY4');

    expect((await directorA.patch(`/api/layout/locations/${locationB.id}`).send({ name: 'x' })).status).toBe(404);
    expect((await directorA.delete(`/api/layout/locations/${locationB.id}`)).status).toBe(404);
    expect((await directorA.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'x', dataType: 'TEXT' })).status).toBe(404);
    expect((await directorA.patch(`/api/layout/subrows/${subRowB.id}`).send({ label: 'x' })).status).toBe(404);
    expect((await directorA.delete(`/api/layout/subrows/${subRowB.id}`)).status).toBe(404);
    expect((await directorA.post(`/api/layout/subrows/${subRowB.id}/move`).send({ direction: 'up' })).status).toBe(404);
  });

  it('a DIRECTOR fully operates within their own Campus (positive control)', async () => {
    const { directorA, sectionA, locationA } = await setupTwoCampuses('CAMPLAY5');

    expect((await directorA.patch(`/api/layout/sections/${sectionA.id}`).send({ name: 'A Section renamed' })).status).toBe(200);
    const newLocation = await directorA.post('/api/layout/locations').send({ sectionId: sectionA.id, name: 'Another A Location' });
    expect(newLocation.status).toBe(201);
    expect((await directorA.patch(`/api/layout/locations/${locationA.id}`).send({ name: 'A Location renamed' })).status).toBe(200);
    const newSection = await directorA.post('/api/layout/sections').send({ name: 'New A Section' });
    expect(newSection.status).toBe(201);
  });

  it('a new Section created by a restricted DIRECTOR always lands in their own Campus, ignoring any campusId in the body', async () => {
    const { directorA, campusB } = await setupTwoCampuses('CAMPLAY6');

    const res = await directorA.post('/api/layout/sections').send({ name: 'Trying to sneak into B', campusId: campusB.id });
    expect(res.status).toBe(201);
    expect(res.body.campusId).not.toBe(campusB.id);
  });

  it('a DIRECTOR/SENIOR_LEAD_INSTRUCTOR with no Campus assigned is fail-closed: sees nothing and cannot create anywhere', async () => {
    const { workspace } = await setupTwoCampuses('CAMPLAY7');
    const unassigned = await seedAdminWithRole(app, workspace.id, 'unassigned@camplay7.example', 'DIRECTOR');

    const list = await unassigned.get('/api/layout');
    expect(list.status).toBe(200);
    expect(list.body.sections).toEqual([]);

    const created = await unassigned.post('/api/layout/sections').send({ name: 'Nowhere' });
    expect(created.status).toBe(404);
  });

  it('ADMIN can move an existing Section to a different Campus, and it then appears there for a Director scoped to it', async () => {
    const { adminAgent, sectionA, campusB, directorB } = await setupTwoCampuses('CAMPLAY8');

    const moved = await adminAgent.patch(`/api/layout/sections/${sectionA.id}`).send({ campusId: campusB.id });
    expect(moved.status).toBe(200);
    expect(moved.body.campusId).toBe(campusB.id);

    const dirBView = await directorB.get('/api/layout');
    expect(dirBView.body.sections.map((s: any) => s.id)).toContain(sectionA.id);
  });

  it('a DIRECTOR cannot move a Section between campuses, even their own', async () => {
    const { directorA, sectionA, campusB } = await setupTwoCampuses('CAMPLAY9');

    const res = await directorA.patch(`/api/layout/sections/${sectionA.id}`).send({ campusId: campusB.id });
    expect(res.status).toBe(400);
  });

  it('404s a campusId from another workspace, and rejects moving into an inactive campus', async () => {
    const { adminAgent, workspace, sectionA } = await setupTwoCampuses('CAMPLAY10');
    const { workspace: otherWorkspace } = await signupAdmin(app, { workspaceCode: 'CAMPLAY10B' });
    const foreignCampus = await getDefaultCampus(otherWorkspace.id);

    const foreign = await adminAgent.patch(`/api/layout/sections/${sectionA.id}`).send({ campusId: foreignCampus.id });
    expect(foreign.status).toBe(404);

    const inactiveCampus = await createCampus(workspace.id, 'Inactive Campus');
    await adminAgent.post(`/api/campuses/${inactiveCampus.id}/deactivate`);
    const toInactive = await adminAgent.patch(`/api/layout/sections/${sectionA.id}`).send({ campusId: inactiveCampus.id });
    expect(toInactive.status).toBe(400);
  });
});

describe('campus isolation — shifts', () => {
  it('GET /api/shifts excludes another Campus\'s shifts for a scoped DIRECTOR, but ADMIN sees both', async () => {
    const { adminAgent, directorA, directorB, subRowA, subRowB } = await setupTwoCampuses('CAMPSH1');
    await adminAgent.post('/api/shifts').send({ subRowId: subRowA.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });
    await adminAgent.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });

    const admin = await adminAgent.get('/api/shifts').query({ date: '2026-08-20' });
    expect(admin.body.shifts).toHaveLength(2);

    const dirA = await directorA.get('/api/shifts').query({ date: '2026-08-20' });
    expect(dirA.body.shifts).toHaveLength(1);
    expect(dirA.body.shifts[0].subRowId).toBe(subRowA.id);

    const dirB = await directorB.get('/api/shifts').query({ date: '2026-08-20' });
    expect(dirB.body.shifts).toHaveLength(1);
    expect(dirB.body.shifts[0].subRowId).toBe(subRowB.id);
  });

  it('a DIRECTOR from Campus A cannot create a shift on a Campus B SubRow', async () => {
    const { directorA, subRowB } = await setupTwoCampuses('CAMPSH2');

    const res = await directorA.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });
    expect(res.status).toBe(404);
  });

  it('a DIRECTOR from Campus A cannot bulk-create against a Campus B SubRow (row is skipped, not created)', async () => {
    const { directorA, subRowB } = await setupTwoCampuses('CAMPSH3');

    const res = await directorA.post('/api/shifts/bulk').send({
      date: '2026-08-20',
      startTime: '09:00',
      endTime: '17:00',
      rows: [{ subRowId: subRowB.id, statusValue: 'SCHEDULED' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(0);
    expect(res.body.skipped).toEqual([{ subRowId: subRowB.id, reason: 'SubRow not found' }]);
  });

  it('a DIRECTOR from Campus A cannot patch or delete a Shift that lives in Campus B, while ADMIN can', async () => {
    const { adminAgent, directorA, subRowB } = await setupTwoCampuses('CAMPSH4');
    const shiftB = (
      await adminAgent.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' })
    ).body;

    expect((await directorA.patch(`/api/shifts/${shiftB.id}`).send({ startTime: '10:00' })).status).toBe(404);
    expect((await directorA.delete(`/api/shifts/${shiftB.id}`)).status).toBe(404);
    expect((await adminAgent.patch(`/api/shifts/${shiftB.id}`).send({ startTime: '10:00' })).status).toBe(200);
  });

  it('a DIRECTOR from Campus A cannot patch a cell value that lives in Campus B, while ADMIN can', async () => {
    const { adminAgent, directorA, subRowB } = await setupTwoCampuses('CAMPSH5');
    const shiftB = (
      await adminAgent.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellB = shiftB.cellValues[0].id;

    expect((await directorA.patch(`/api/shifts/cells/${cellB}`).send({ statusValue: 'COMPLETED' })).status).toBe(404);
    expect((await adminAgent.patch(`/api/shifts/cells/${cellB}`).send({ statusValue: 'COMPLETED' })).status).toBe(200);
  });

  it('a DIRECTOR from Campus A cannot upload or delete a file on a Campus B cell, while ADMIN can', async () => {
    const { adminAgent, directorA, fileSubRowA, campusB, workspace } = await setupTwoCampuses('CAMPSH6');
    // fileSubRowA lives in Campus A — build an equivalent FILE row in Campus B directly.
    const sectionB = (await adminAgent.get('/api/layout')).body.sections.find((s: any) => s.campusId === campusB.id);
    const locationB = sectionB.locations[0];
    const fileSubRowB = (
      await adminAgent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Files B', dataType: 'FILE' })
    ).body;
    const shiftB = (
      await adminAgent.post('/api/shifts').send({ subRowId: fileSubRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellB = shiftB.cellValues[0].id;

    const deniedUpload = await directorA.post(`/api/shifts/cells/${cellB}/files`).attach('file', Buffer.from('x'), 'x.txt');
    expect(deniedUpload.status).toBe(404);

    const upload = await adminAgent.post(`/api/shifts/cells/${cellB}/files`).attach('file', Buffer.from('x'), 'x.txt');
    expect(upload.status).toBe(201);
    uploadedPaths.push(path.join(UPLOAD_DIR, path.basename(upload.body.url)));

    const deniedDelete = await directorA.delete(`/api/shifts/files/${upload.body.id}`);
    expect(deniedDelete.status).toBe(404);

    const allowedDelete = await adminAgent.delete(`/api/shifts/files/${upload.body.id}`);
    expect(allowedDelete.status).toBe(200);
  });

  it('a DIRECTOR fully operates on shifts within their own Campus (positive control)', async () => {
    const { directorA, subRowA } = await setupTwoCampuses('CAMPSH7');

    const created = await directorA.post('/api/shifts').send({ subRowId: subRowA.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });
    expect(created.status).toBe(201);
    expect((await directorA.patch(`/api/shifts/${created.body.id}`).send({ startTime: '10:00' })).status).toBe(200);
    expect((await directorA.delete(`/api/shifts/${created.body.id}`)).status).toBe(200);
  });

  it('a SENIOR_LEAD_INSTRUCTOR is scoped exactly like a DIRECTOR: full access within their Campus, 404 outside it', async () => {
    const { sliA, subRowA, subRowB } = await setupTwoCampuses('CAMPSH8');

    const created = await sliA.post('/api/shifts').send({ subRowId: subRowA.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });
    expect(created.status).toBe(201);

    const denied = await sliA.post('/api/shifts').send({ subRowId: subRowB.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' });
    expect(denied.status).toBe(404);
  });
});

describe('campus isolation — employees', () => {
  it('a restricted DIRECTOR creating an employee always gets their own Campus, ignoring any campusId in the body', async () => {
    const { directorA, campusA, campusB } = await setupTwoCampuses('CAMPEMP1');

    const res = await directorA.post('/api/employees').send({ name: 'Sneaky Hire', pin: '1111', campusId: campusB.id });
    expect(res.status).toBe(201);
    expect(res.body.campusId).toBe(campusA.id);
  });

  it('ADMIN can create an employee scoped to a specific campus, or floating (no campusId) if omitted', async () => {
    const { adminAgent, campusA } = await setupTwoCampuses('CAMPEMP2');

    const scoped = await adminAgent.post('/api/employees').send({ name: 'Scoped Hire', pin: '1111', campusId: campusA.id });
    expect(scoped.status).toBe(201);
    expect(scoped.body.campusId).toBe(campusA.id);
    expect(scoped.body.campus).toEqual({ id: campusA.id, name: expect.any(String) });

    const floating = await adminAgent.post('/api/employees').send({ name: 'Floating Hire', pin: '2222' });
    expect(floating.status).toBe(201);
    expect(floating.body.campusId).toBeNull();
    expect(floating.body.campus).toBeNull();
  });

  it('a DIRECTOR/SENIOR_LEAD_INSTRUCTOR with no Campus assigned cannot create an employee anywhere', async () => {
    const { workspace } = await setupTwoCampuses('CAMPEMP3');
    const unassigned = await seedAdminWithRole(app, workspace.id, 'unassigned@campemp3.example', 'DIRECTOR');

    const res = await unassigned.post('/api/employees').send({ name: 'Nowhere', pin: '1111' });
    expect(res.status).toBe(404);
  });

  it('GET /api/employees: a scoped DIRECTOR sees their own Campus plus floating employees, never the other Campus; ADMIN sees everyone', async () => {
    const { adminAgent, directorA, directorB, campusA, campusB } = await setupTwoCampuses('CAMPEMP4');
    await adminAgent.post('/api/employees').send({ name: 'A Employee', pin: '1111', campusId: campusA.id });
    await adminAgent.post('/api/employees').send({ name: 'B Employee', pin: '2222', campusId: campusB.id });
    await adminAgent.post('/api/employees').send({ name: 'Floating Employee', pin: '3333' });

    const dirA = await directorA.get('/api/employees');
    expect(dirA.body.employees.map((e: any) => e.name).sort()).toEqual(['A Employee', 'Floating Employee']);

    const dirB = await directorB.get('/api/employees');
    expect(dirB.body.employees.map((e: any) => e.name).sort()).toEqual(['B Employee', 'Floating Employee']);

    const admin = await adminAgent.get('/api/employees');
    expect(admin.body.employees).toHaveLength(3);

    const narrowed = await adminAgent.get('/api/employees').query({ campusId: campusA.id });
    expect(narrowed.body.employees.map((e: any) => e.name).sort()).toEqual(['A Employee', 'Floating Employee']);
  });

  it('a DIRECTOR from Campus A cannot read, patch, or delete an employee scoped to Campus B', async () => {
    const { adminAgent, directorA, campusB } = await setupTwoCampuses('CAMPEMP5');
    const empB = (await adminAgent.post('/api/employees').send({ name: 'B Employee', pin: '1111', campusId: campusB.id })).body;

    expect((await directorA.patch(`/api/employees/${empB.id}`).send({ name: 'hijacked' })).status).toBe(404);
    expect((await directorA.delete(`/api/employees/${empB.id}`)).status).toBe(404);
  });

  it('PATCH campusId: 400 for a restricted DIRECTOR, 200 for ADMIN, and validates the target campus', async () => {
    const { adminAgent, directorA, campusA, campusB, workspace } = await setupTwoCampuses('CAMPEMP6');
    const emp = (await adminAgent.post('/api/employees').send({ name: 'Movable', pin: '1111', campusId: campusA.id })).body;

    const deniedForDirector = await directorA.patch(`/api/employees/${emp.id}`).send({ campusId: campusB.id });
    expect(deniedForDirector.status).toBe(400);

    const moved = await adminAgent.patch(`/api/employees/${emp.id}`).send({ campusId: campusB.id });
    expect(moved.status).toBe(200);
    expect(moved.body.campusId).toBe(campusB.id);

    const toFloating = await adminAgent.patch(`/api/employees/${emp.id}`).send({ campusId: null });
    expect(toFloating.status).toBe(200);
    expect(toFloating.body.campusId).toBeNull();

    const { workspace: otherWorkspace } = await signupAdmin(app, { workspaceCode: 'CAMPEMP6B' });
    const foreignCampus = await getDefaultCampus(otherWorkspace.id);
    const foreign = await adminAgent.patch(`/api/employees/${emp.id}`).send({ campusId: foreignCampus.id });
    expect(foreign.status).toBe(404);

    const inactiveCampus = await createCampus(workspace.id, 'Inactive Campus');
    await adminAgent.post(`/api/campuses/${inactiveCampus.id}/deactivate`);
    const toInactive = await adminAgent.patch(`/api/employees/${emp.id}`).send({ campusId: inactiveCampus.id });
    expect(toInactive.status).toBe(400);
  });

  it('STAFF assignment is restricted to same-campus or floating employees, silently excluding the rest', async () => {
    const { adminAgent, campusA, campusB, subRowA } = await setupTwoCampuses('CAMPEMP7');
    const staffSubRowA = (
      await adminAgent.post('/api/layout/subrows').send({ locationId: (await adminAgent.get('/api/layout')).body.sections
        .find((s: any) => s.campusId === campusA.id).locations[0].id, label: 'Staff A', dataType: 'STAFF' })
    ).body;

    const empA = (await adminAgent.post('/api/employees').send({ name: 'A Employee', pin: '1111', campusId: campusA.id })).body;
    const empB = (await adminAgent.post('/api/employees').send({ name: 'B Employee', pin: '2222', campusId: campusB.id })).body;
    const empFloating = (await adminAgent.post('/api/employees').send({ name: 'Floating Employee', pin: '3333' })).body;

    const shift = (
      await adminAgent.post('/api/shifts').send({ subRowId: staffSubRowA.id, date: '2026-08-20', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellId = shift.cellValues[0].id;

    const patched = await adminAgent
      .patch(`/api/shifts/cells/${cellId}`)
      .send({ staffEmployeeIds: [empA.id, empB.id, empFloating.id] });
    expect(patched.status).toBe(200);
    const assignedIds = patched.body.staffAssignments.map((a: any) => a.employee.id).sort();
    expect(assignedIds).toEqual([empA.id, empFloating.id].sort());

    const bulk = await adminAgent.post('/api/shifts/bulk').send({
      date: '2026-08-21',
      startTime: '09:00',
      endTime: '17:00',
      rows: [{ subRowId: staffSubRowA.id, staffEmployeeIds: [empA.id, empB.id, empFloating.id] }],
    });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toHaveLength(1);
    const bulkCell = await adminAgent.get('/api/shifts').query({ date: '2026-08-21' });
    const bulkAssignedIds = bulkCell.body.shifts[0].cellValues[0].staffAssignments.map((a: any) => a.employee.id).sort();
    expect(bulkAssignedIds).toEqual([empA.id, empFloating.id].sort());
  });
});
