import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole } from '../testUtils/authHelpers';

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
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@lrole2.example', 'DIRECTOR');
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
