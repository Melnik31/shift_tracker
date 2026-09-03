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
    expect(res.body.onboardingStep).toBe(3);

    const tree = await agent.get('/api/layout');
    expect(tree.body.sections).toHaveLength(1);
    expect(tree.body.sections[0].locations).toHaveLength(1);
    expect(tree.body.sections[0].locations[0].subRows).toHaveLength(1);
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
