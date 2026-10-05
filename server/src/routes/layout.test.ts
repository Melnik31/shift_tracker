import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole, getDefaultCampus } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('layout CRUD (sections/locations/subrows)', () => {
  it('creates, reads, updates, and deletes a section', async () => {
    const { agent } = await signupAdmin(app);

    const created = await agent.post('/api/layout/sections').send({ name: 'Front of House' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Front of House');

    const patched = await agent.patch(`/api/layout/sections/${created.body.id}`).send({ name: 'Renamed' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Renamed');

    const listed = await agent.get('/api/layout');
    expect(listed.body.sections).toHaveLength(1);
    expect(listed.body.sections[0].name).toBe('Renamed');

    const deleted = await agent.delete(`/api/layout/sections/${created.body.id}`);
    expect(deleted.status).toBe(200);

    const afterDelete = await agent.get('/api/layout');
    expect(afterDelete.body.sections).toHaveLength(0);
  });

  it('rejects a section without a name', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.post('/api/layout/sections').send({});
    expect(res.status).toBe(400);
  });

  it('404s patching/deleting a section id that does not exist', async () => {
    const { agent } = await signupAdmin(app);
    expect((await agent.patch('/api/layout/sections/does-not-exist').send({ name: 'x' })).status).toBe(404);
    expect((await agent.delete('/api/layout/sections/does-not-exist')).status).toBe(404);
  });

  it('nests a location under a section and a subrow under that location', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'Section' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Location' })).body;
    expect(location.sectionId).toBe(section.id);

    const subRow = (
      await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Status', dataType: 'STATUS' })
    ).body;
    expect(subRow.locationId).toBe(location.id);
    expect(subRow.dataType).toBe('STATUS');

    const tree = await agent.get('/api/layout');
    expect(tree.body.sections[0].locations[0].subRows[0].label).toBe('Status');
  });

  it('rejects a subrow with an invalid dataType', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'Section' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Location' })).body;

    const res = await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Bad', dataType: 'NOT_A_TYPE' });
    expect(res.status).toBe(400);
  });

  it('deleting a section cascades to its locations and subrows', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'Section' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Location' })).body;
    await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Status', dataType: 'STATUS' });

    const deleted = await agent.delete(`/api/layout/sections/${section.id}`);
    expect(deleted.status).toBe(200);

    // Re-creating a subrow under the now-deleted location must 404 —
    // proof the cascade actually removed it, not just the section row.
    const res = await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'X', dataType: 'STATUS' });
    expect(res.status).toBe(404);
  });

  it('moves a section up/down and swaps sortOrder with its sibling', async () => {
    const { agent } = await signupAdmin(app);
    const first = (await agent.post('/api/layout/sections').send({ name: 'First' })).body;
    const second = (await agent.post('/api/layout/sections').send({ name: 'Second' })).body;
    expect(first.sortOrder).toBeLessThan(second.sortOrder);

    await agent.post(`/api/layout/sections/${second.id}/move`).send({ direction: 'up' });

    const tree = await agent.get('/api/layout');
    expect(tree.body.sections.map((s: { name: string }) => s.name)).toEqual(['Second', 'First']);
  });

  it('rejects a duplicate workspace code on PATCH /workspace', async () => {
    await signupAdmin(app, { workspaceCode: 'TAKEN1' });
    const { agent } = await signupAdmin(app, { workspaceCode: 'FREE1' });

    const res = await agent.patch('/api/layout/workspace').send({ workspaceCode: 'TAKEN1' });
    expect(res.status).toBe(409);
  });

  it('skip-onboarding fills in a default section/location/subrow when the workspace is empty', async () => {
    const { agent } = await signupAdmin(app);

    const res = await agent.post('/api/layout/skip-onboarding');
    expect(res.status).toBe(200);
    expect(res.body.onboardingStep).toBe(4);

    const tree = await agent.get('/api/layout');
    expect(tree.body.sections).toHaveLength(1);
    expect(tree.body.sections[0].locations).toHaveLength(1);
    expect(tree.body.sections[0].locations[0].subRows).toHaveLength(1);
  });
});

describe('SubRow.isGroupField (Coach Group Hours)', () => {
  async function makeLocation(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'Section' })).body;
    return (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Location' })).body;
  }

  it('sets a BADGE subrow as the group field and reflects it in GET /api/layout', async () => {
    const { agent } = await signupAdmin(app);
    const location = await makeLocation(agent);
    const tier = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Tier', dataType: 'BADGE' })).body;

    const patched = await agent.patch(`/api/layout/subrows/${tier.id}`).send({ isGroupField: true });
    expect(patched.status).toBe(200);
    expect(patched.body.isGroupField).toBe(true);

    const tree = await agent.get('/api/layout');
    const subRow = tree.body.sections[0].locations[0].subRows[0];
    expect(subRow.isGroupField).toBe(true);
  });

  it('rejects isGroupField: true on a non-BADGE subrow', async () => {
    const { agent } = await signupAdmin(app);
    const location = await makeLocation(agent);
    const status = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Status', dataType: 'STATUS' })).body;

    const res = await agent.patch(`/api/layout/subrows/${status.id}`).send({ isGroupField: true });
    expect(res.status).toBe(400);
  });

  it('setting a second BADGE subrow as the group field unsets the first, within the same Location', async () => {
    const { agent } = await signupAdmin(app);
    const location = await makeLocation(agent);
    const tier = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Tier', dataType: 'BADGE' })).body;
    const division = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Division', dataType: 'BADGE' })).body;

    await agent.patch(`/api/layout/subrows/${tier.id}`).send({ isGroupField: true });
    await agent.patch(`/api/layout/subrows/${division.id}`).send({ isGroupField: true });

    const tree = await agent.get('/api/layout');
    const subRows = tree.body.sections[0].locations[0].subRows;
    expect(subRows.find((s: { id: string }) => s.id === tier.id).isGroupField).toBe(false);
    expect(subRows.find((s: { id: string }) => s.id === division.id).isGroupField).toBe(true);
  });

  it('does not unset a group field in a different Location', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'Section' })).body;
    const locationA = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'A' })).body;
    const locationB = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'B' })).body;
    const tierA = (await agent.post('/api/layout/subrows').send({ locationId: locationA.id, label: 'Tier', dataType: 'BADGE' })).body;
    const tierB = (await agent.post('/api/layout/subrows').send({ locationId: locationB.id, label: 'Tier', dataType: 'BADGE' })).body;

    await agent.patch(`/api/layout/subrows/${tierA.id}`).send({ isGroupField: true });
    await agent.patch(`/api/layout/subrows/${tierB.id}`).send({ isGroupField: true });

    const tree = await agent.get('/api/layout');
    const locations = tree.body.sections[0].locations;
    const subRowA = locations.find((l: { id: string }) => l.id === locationA.id).subRows[0];
    const subRowB = locations.find((l: { id: string }) => l.id === locationB.id).subRows[0];
    expect(subRowA.isGroupField).toBe(true);
    expect(subRowB.isGroupField).toBe(true);
  });
});

describe('duplicating a location', () => {
  async function makeLocationWithSubRows(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'ICE' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink C' })).body;
    const tier = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Tier', dataType: 'BADGE' })).body;
    const coach = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Skater Coach', dataType: 'STAFF' })).body;
    return { section, location, tier, coach };
  }

  it('copies every source SubRow (label, dataType, order) onto a new Location in the same Section', async () => {
    const { agent } = await signupAdmin(app);
    const { section, location } = await makeLocationWithSubRows(agent);

    const res = await agent.post(`/api/layout/locations/${location.id}/duplicate`).send({ newName: 'Rink B' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Rink B');
    expect(res.body.sectionId).toBe(section.id);
    expect(res.body.subRows.map((sr: any) => ({ label: sr.label, dataType: sr.dataType }))).toEqual([
      { label: 'Tier', dataType: 'BADGE' },
      { label: 'Skater Coach', dataType: 'STAFF' },
    ]);
    // sortOrder preserved relative to the source, not renumbered
    expect(res.body.subRows[0].sortOrder).toBeLessThan(res.body.subRows[1].sortOrder);

    // Persisted, not just in the response — and the original is untouched.
    const tree = await agent.get('/api/layout');
    const original = tree.body.sections[0].locations.find((l: any) => l.name === 'Rink C');
    const copy = tree.body.sections[0].locations.find((l: any) => l.name === 'Rink B');
    expect(original.subRows).toHaveLength(2);
    expect(copy.subRows).toHaveLength(2);
  });

  it('duplicating a location with zero sub-rows works (empty copy)', async () => {
    const { agent } = await signupAdmin(app);
    const section = (await agent.post('/api/layout/sections').send({ name: 'Empty Section' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Blank' })).body;

    const res = await agent.post(`/api/layout/locations/${location.id}/duplicate`).send({ newName: 'Blank Copy' });
    expect(res.status).toBe(201);
    expect(res.body.subRows).toEqual([]);
  });

  it('does not copy Shift/CellValue data from the source location', async () => {
    const { agent } = await signupAdmin(app);
    const { coach } = await makeLocationWithSubRows(agent);
    await agent.post('/api/shifts').send({ subRowId: coach.id, date: '2026-09-01', startTime: '09:00', endTime: '17:00' });

    const dup = await agent.post(`/api/layout/locations/${coach.locationId}/duplicate`).send({ newName: 'Rink B' });
    const newCoachSubRow = dup.body.subRows.find((sr: any) => sr.label === 'Skater Coach');

    const shifts = await agent.get('/api/shifts').query({ date: '2026-09-01' });
    expect(shifts.body.shifts).toHaveLength(1);
    expect(shifts.body.shifts[0].subRowId).not.toBe(newCoachSubRow.id);
    expect(shifts.body.shifts[0].subRowId).toBe(coach.id);
  });

  it('400s a blank or missing newName', async () => {
    const { agent } = await signupAdmin(app);
    const { location } = await makeLocationWithSubRows(agent);

    expect((await agent.post(`/api/layout/locations/${location.id}/duplicate`).send({})).status).toBe(400);
    expect((await agent.post(`/api/layout/locations/${location.id}/duplicate`).send({ newName: '   ' })).status).toBe(400);
  });

  it('404s a location id from another workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'DUP1' });
    const { agent: otherAgent } = await signupAdmin(app, { workspaceCode: 'DUP1B' });
    const { location } = await makeLocationWithSubRows(otherAgent);

    const res = await agent.post(`/api/layout/locations/${location.id}/duplicate`).send({ newName: 'Hijacked' });
    expect(res.status).toBe(404);
  });
});

describe('layout role gating (requireRole DIRECTOR/ADMIN/CEO)', () => {
  it('404s a COACH session (employee login) on both a read and a mutation route', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'LROLE1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await coachAgent.get('/api/layout')).status).toBe(404);
    expect((await coachAgent.post('/api/layout/sections').send({ name: 'x' })).status).toBe(404);
  });

  it('DIRECTOR, ADMIN, and CEO all succeed identically on reads and mutations', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'LROLE2' });
    // DIRECTOR is Campus-scoped (see campusIsolation.test.ts for the
    // cross-campus restriction itself) — assigning them to the workspace's
    // own default Campus is what "succeeds identically" means here: full
    // capability within their campus, not cross-campus reach.
    const defaultCampus = await getDefaultCampus(workspace.id);
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@lrole2.example', 'DIRECTOR', { campusId: defaultCampus.id });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@lrole2.example', 'CEO');

    for (const [label, agent] of [['admin', adminAgent], ['director', directorAgent], ['ceo', ceoAgent]] as const) {
      expect((await agent.get('/api/layout')).status).toBe(200);
      const created = await agent.post('/api/layout/sections').send({ name: `Section by ${label}` });
      expect(created.status).toBe(201);
      expect((await agent.patch(`/api/layout/sections/${created.body.id}`).send({ name: 'renamed' })).status).toBe(200);
      expect((await agent.delete(`/api/layout/sections/${created.body.id}`)).status).toBe(200);
    }
  });
});

describe('GET /api/layout/impact (removal warning counts)', () => {
  async function setup(agent: Awaited<ReturnType<typeof signupAdmin>>['agent']) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const notes = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Notes', dataType: 'TEXT' })).body;
    const other = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Other', dataType: 'TEXT' })).body;
    // One past shift and one far-future shift on `notes`; one future shift on `other`.
    await agent.post('/api/shifts').send({ subRowId: notes.id, date: '2020-01-01', startTime: '09:00', endTime: '10:00' });
    await agent.post('/api/shifts').send({ subRowId: notes.id, date: '2099-01-01', startTime: '09:00', endTime: '10:00' });
    await agent.post('/api/shifts').send({ subRowId: other.id, date: '2099-01-02', startTime: '09:00', endTime: '10:00' });
    return { section, location, notes, other };
  }

  it('counts the shifts a section, location, or sub-row removal would delete, split into upcoming', async () => {
    const { agent } = await signupAdmin(app);
    const { section, location, notes, other } = await setup(agent);

    const bySection = await agent.get('/api/layout/impact').query({ kind: 'section', id: section.id });
    expect(bySection.body).toEqual({ shifts: 3, upcoming: 2 });
    expect((await agent.get('/api/layout/impact').query({ kind: 'location', id: location.id })).body).toEqual({ shifts: 3, upcoming: 2 });
    expect((await agent.get('/api/layout/impact').query({ kind: 'subrow', id: notes.id })).body).toEqual({ shifts: 2, upcoming: 1, filledCells: 0 });
    expect((await agent.get('/api/layout/impact').query({ kind: 'subrow', id: other.id })).body).toEqual({ shifts: 1, upcoming: 1, filledCells: 0 });
  });

  it('rejects a bad kind, 404s unknown ids, and hides other workspaces', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'IMP1' });
    const { agent: other } = await signupAdmin(app, { workspaceCode: 'IMP2' });
    const { section } = await setup(agent);

    expect((await agent.get('/api/layout/impact').query({ kind: 'nope', id: section.id })).status).toBe(400);
    expect((await agent.get('/api/layout/impact').query({ kind: 'section', id: 'missing' })).status).toBe(404);
    expect((await other.get('/api/layout/impact').query({ kind: 'section', id: section.id })).status).toBe(404);
  });
});

describe('changing a field type (PATCH /api/layout/subrows/:id { dataType })', () => {
  async function makeField(agent: Awaited<ReturnType<typeof signupAdmin>>['agent'], dataType: string) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const subRow = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Field', dataType })).body;
    return { location, subRow };
  }

  it('changes the type of a field with no shift data', async () => {
    const { agent } = await signupAdmin(app);
    const { subRow } = await makeField(agent, 'TEXT');
    // An empty shift on the row (no values) doesn't block it.
    await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2030-01-01', startTime: '09:00', endTime: '10:00' });

    const res = await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ dataType: 'STAFF', label: 'Coach' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dataType: 'STAFF', label: 'Coach' });
  });

  it('clears the group-field flag when a BADGE field changes to another type', async () => {
    const { agent } = await signupAdmin(app);
    const { subRow } = await makeField(agent, 'BADGE');
    await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ isGroupField: true });

    const res = await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ dataType: 'TEXT' });
    expect(res.body).toMatchObject({ dataType: 'TEXT', isGroupField: false });
  });

  it('409s once any shift has a value, staff assignment in the field, and reports the count', async () => {
    const { agent } = await signupAdmin(app);
    const { subRow } = await makeField(agent, 'TEXT');
    const shift = (await agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2030-01-01', startTime: '09:00', endTime: '10:00' })).body;
    await agent.patch(`/api/shifts/cells/${shift.cellValues[0].id}`).send({ textValue: 'Bring pucks' });

    const res = await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ dataType: 'LINK' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 shift/);

    const impact = await agent.get('/api/layout/impact').query({ kind: 'subrow', id: subRow.id });
    expect(impact.body.filledCells).toBe(1);

    // Renaming (no type change) is still fine.
    expect((await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ label: 'Notes', dataType: 'TEXT' })).status).toBe(200);
  });

  it('rejects an unknown type and keeps the group-field rule against the new type', async () => {
    const { agent } = await signupAdmin(app);
    const { subRow } = await makeField(agent, 'TEXT');
    expect((await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ dataType: 'NOPE' })).status).toBe(400);
    // Becoming BADGE and the group field in one request is allowed.
    const res = await agent.patch(`/api/layout/subrows/${subRow.id}`).send({ dataType: 'BADGE', isGroupField: true });
    expect(res.body).toMatchObject({ dataType: 'BADGE', isGroupField: true });
  });
});
