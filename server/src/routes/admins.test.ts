import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { prisma } from '../db';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole, getDefaultCampus, createCampus } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('admin-users role gating (requireRole ADMIN/CEO)', () => {
  it('404s a COACH session and a DIRECTOR session', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');
    const defaultCampus = await getDefaultCampus(workspace.id);
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@ad1.example', 'DIRECTOR', { campusId: defaultCampus.id });

    expect((await coachAgent.get('/api/admin-users')).status).toBe(404);
    expect((await directorAgent.get('/api/admin-users')).status).toBe(404);
    expect((await directorAgent.post('/api/admin-users').send({ email: 'x@x.com', password: 'x', role: 'ADMIN' })).status).toBe(404);
  });

  it('CEO gets identical, full access to ADMIN', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'AD2' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@ad2.example', 'CEO');

    const created = await ceoAgent.post('/api/admin-users').send({ email: 'new@ad2.example', password: 'pw123456', role: 'ADMIN' });
    expect(created.status).toBe(201);
    expect((await adminAgent.get('/api/admin-users')).status).toBe(200);
  });
});

describe('GET /api/admin-users', () => {
  it('lists every admin in the workspace including self, and never returns passwordHash', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD3', email: 'boss@ad3.example' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    await agent.post('/api/admin-users').send({ email: 'dir@ad3.example', password: 'pw123456', role: 'DIRECTOR', campusId: defaultCampus.id });

    const res = await agent.get('/api/admin-users');
    expect(res.status).toBe(200);
    expect(res.body.admins).toHaveLength(2);
    const emails = res.body.admins.map((a: any) => a.email).sort();
    expect(emails).toEqual(['boss@ad3.example', 'dir@ad3.example']);
    for (const a of res.body.admins) {
      expect(a.passwordHash).toBeUndefined();
    }
    const dir = res.body.admins.find((a: any) => a.email === 'dir@ad3.example');
    expect(dir.campus).toEqual({ id: defaultCampus.id, name: defaultCampus.name });
    expect(dir.active).toBe(true);
  });
});

describe('POST /api/admin-users', () => {
  it('creates a DIRECTOR with a valid campusId', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD4' });
    const defaultCampus = await getDefaultCampus(workspace.id);

    const res = await agent
      .post('/api/admin-users')
      .send({ name: 'Jamie Rivera', email: 'dir@ad4.example', password: 'pw123456', role: 'DIRECTOR', campusId: defaultCampus.id });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jamie Rivera');
    expect(res.body.role).toBe('DIRECTOR');
    expect(res.body.campus.id).toBe(defaultCampus.id);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('logs a RoleChange row (oldRole: null) on creation', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD4B' });
    const rootAdmin = (await agent.get('/api/admin-users')).body.admins[0];

    const created = await agent.post('/api/admin-users').send({ email: 'dir@ad4b.example', password: 'pw123456', role: 'ADMIN' });
    expect(created.status).toBe(201);

    const changes = await prisma.roleChange.findMany({ where: { targetUserId: created.body.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].oldRole).toBeNull();
    expect(changes[0].newRole).toBe('ADMIN');
    expect(changes[0].actorId).toBe(rootAdmin.id);
    expect(changes[0].reason).toBe('Account created');
  });

  it('rejects DIRECTOR/SENIOR_LEAD_INSTRUCTOR with no campusId (400)', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD5' });

    const res = await agent.post('/api/admin-users').send({ email: 'dir@ad5.example', password: 'pw123456', role: 'DIRECTOR' });
    expect(res.status).toBe(400);

    const res2 = await agent
      .post('/api/admin-users')
      .send({ email: 'sli@ad5.example', password: 'pw123456', role: 'SENIOR_LEAD_INSTRUCTOR' });
    expect(res2.status).toBe(400);
  });

  it('404s a campusId that belongs to a different workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD6' });
    const { workspace: otherWorkspace } = await signupAdmin(app, { workspaceCode: 'AD6B' });
    const foreignCampus = await getDefaultCampus(otherWorkspace.id);

    const res = await agent
      .post('/api/admin-users')
      .send({ email: 'dir@ad6.example', password: 'pw123456', role: 'DIRECTOR', campusId: foreignCampus.id });
    expect(res.status).toBe(404);
  });

  it('rejects assigning an inactive campus', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD7' });
    const second = await createCampus(workspace.id, 'Second Campus');
    await agent.post(`/api/campuses/${second.id}/deactivate`);

    const res = await agent
      .post('/api/admin-users')
      .send({ email: 'dir@ad7.example', password: 'pw123456', role: 'DIRECTOR', campusId: second.id });
    expect(res.status).toBe(400);
  });

  it('forces campusId to null for ADMIN/CEO even if the client sends one', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD8' });
    const defaultCampus = await getDefaultCampus(workspace.id);

    const res = await agent
      .post('/api/admin-users')
      .send({ email: 'admin2@ad8.example', password: 'pw123456', role: 'ADMIN', campusId: defaultCampus.id });
    expect(res.status).toBe(201);
    expect(res.body.campus).toBeNull();
  });

  it('409s a duplicate email within the workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD9', email: 'boss@ad9.example' });
    const res = await agent.post('/api/admin-users').send({ email: 'boss@ad9.example', password: 'pw123456', role: 'ADMIN' });
    expect(res.status).toBe(409);
  });

  it('400s an invalid role, and never accepts COACH', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD10' });
    expect((await agent.post('/api/admin-users').send({ email: 'x@ad10.example', password: 'pw123456', role: 'MANAGER' })).status).toBe(400);
    expect((await agent.post('/api/admin-users').send({ email: 'y@ad10.example', password: 'pw123456', role: 'COACH' })).status).toBe(400);
  });
});

describe('PATCH /api/admin-users/:id', () => {
  it('400s if the body includes role — must use PATCH /:id/role instead', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD11C' });
    const created = (await agent.post('/api/admin-users').send({ email: 'x@ad11c.example', password: 'pw123456', role: 'ADMIN' })).body;

    const res = await agent.patch(`/api/admin-users/${created.id}`).send({ role: 'DIRECTOR' });
    expect(res.status).toBe(400);
    // Untouched — the generic PATCH never applied the rejected role change.
    const list = await agent.get('/api/admin-users');
    expect(list.body.admins.find((a: any) => a.id === created.id).role).toBe('ADMIN');
  });

  it('a plain campusId change (no role change) still works, cross-validated against the existing role', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD11' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    const created = (
      await agent.post('/api/admin-users').send({ email: 'x@ad11.example', password: 'pw123456', role: 'DIRECTOR', campusId: defaultCampus.id })
    ).body;

    const res = await agent.patch(`/api/admin-users/${created.id}`).send({ campusId: second.id });
    expect(res.status).toBe(200);
    expect(res.body.campus.id).toBe(second.id);
  });

  it('can update email and password without touching role/campus', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD13' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    const created = (
      await agent.post('/api/admin-users').send({ email: 'x@ad13.example', password: 'pw123456', role: 'DIRECTOR', campusId: defaultCampus.id })
    ).body;

    const res = await agent.patch(`/api/admin-users/${created.id}`).send({ email: 'renamed@ad13.example' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('renamed@ad13.example');
    expect(res.body.role).toBe('DIRECTOR');
    expect(res.body.campus.id).toBe(defaultCampus.id);
  });

  it('an email/password-only PATCH does not re-validate the existing campusId, even if that campus was deactivated afterward', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD13B' });
    const second = (await agent.post('/api/campuses').send({ name: 'Second' })).body;
    const created = (
      await agent.post('/api/admin-users').send({ email: 'x@ad13b.example', password: 'pw123456', role: 'DIRECTOR', campusId: second.id })
    ).body;

    await agent.post(`/api/campuses/${second.id}/deactivate`);

    const res = await agent.patch(`/api/admin-users/${created.id}`).send({ email: 'renamed@ad13b.example' });
    expect(res.status).toBe(200);
    expect(res.body.campus.id).toBe(second.id);
  });

  it('404s an admin id from another workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD14' });
    const { agent: otherAgent } = await signupAdmin(app, { workspaceCode: 'AD14B' });
    const otherAdminId = (await otherAgent.get('/api/admin-users')).body.admins[0].id;

    const res = await agent.patch(`/api/admin-users/${otherAdminId}`).send({ email: 'hijack@ad14.example' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin-users/:id/role', () => {
  it('changing role INTO a campus-scoped role requires a campusId in the same request, and logs a RoleChange row', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AR1' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    const created = (await agent.post('/api/admin-users').send({ email: 'x@ar1.example', password: 'pw123456', role: 'ADMIN' })).body;

    const withoutCampus = await agent.patch(`/api/admin-users/${created.id}/role`).send({ newRole: 'DIRECTOR', reason: 'Reorg' });
    expect(withoutCampus.status).toBe(400);

    const withCampus = await agent
      .patch(`/api/admin-users/${created.id}/role`)
      .send({ newRole: 'DIRECTOR', campusId: defaultCampus.id, reason: 'Reorg' });
    expect(withCampus.status).toBe(200);
    expect(withCampus.body.campus.id).toBe(defaultCampus.id);

    const list = await agent.get('/api/admin-users');
    expect(list.body.admins.find((a: any) => a.id === created.id).role).toBe('DIRECTOR');

    const changes = await prisma.roleChange.findMany({ where: { targetUserId: created.id }, orderBy: { createdAt: 'asc' } });
    // [0] is the creation-time log (oldRole: null); [1] is this promotion.
    expect(changes).toHaveLength(2);
    expect(changes[1].oldRole).toBe('ADMIN');
    expect(changes[1].newRole).toBe('DIRECTOR');
    expect(changes[1].reason).toBe('Reorg');
  });

  it('changing role OUT of a campus-scoped role clears campusId regardless of what is sent', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AR2' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    const created = (
      await agent.post('/api/admin-users').send({ email: 'x@ar2.example', password: 'pw123456', role: 'DIRECTOR', campusId: defaultCampus.id })
    ).body;

    const res = await agent
      .patch(`/api/admin-users/${created.id}/role`)
      .send({ newRole: 'ADMIN', campusId: defaultCampus.id, reason: 'Promotion' });
    expect(res.status).toBe(200);
    expect(res.body.campus).toBeNull();
  });

  it('400s a missing or blank reason', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AR3' });
    const created = (await agent.post('/api/admin-users').send({ email: 'x@ar3.example', password: 'pw123456', role: 'ADMIN' })).body;

    expect((await agent.patch(`/api/admin-users/${created.id}/role`).send({ newRole: 'CEO' })).status).toBe(400);
    expect((await agent.patch(`/api/admin-users/${created.id}/role`).send({ newRole: 'CEO', reason: '   ' })).status).toBe(400);
  });

  it('409s changing your own role', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AR4' });
    const self = (await agent.get('/api/admin-users')).body.admins[0];

    const res = await agent.patch(`/api/admin-users/${self.id}/role`).send({ newRole: 'CEO', reason: 'Self promotion attempt' });
    expect(res.status).toBe(409);
  });

  it('409s demoting the last remaining active Admin/CEO', async () => {
    const { agent: rootAgent, workspace } = await signupAdmin(app, { workspaceCode: 'AR5' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@ar5.example', 'CEO');
    const rootSelf = (await rootAgent.get('/api/admin-users')).body.admins.find((a: any) => a.email !== 'ceo@ar5.example');

    // ceo demotes root — 1 unrestricted admin (ceo) remains. Allowed.
    expect(
      (await ceoAgent.patch(`/api/admin-users/${rootSelf.id}/role`).send({ newRole: 'DIRECTOR', campusId: (await getDefaultCampus(workspace.id)).id, reason: 'x' })).status
    ).toBe(200);

    const ceoSelf = (await ceoAgent.get('/api/admin-users')).body.admins.find((a: any) => a.email === 'ceo@ar5.example');
    // root's session is still authenticated (stale but valid, see the
    // analogous last-admin test for /deactivate) — attempting to demote
    // ceo, the last active unrestricted admin, is blocked.
    const res = await rootAgent.patch(`/api/admin-users/${ceoSelf.id}/role`).send({ newRole: 'DIRECTOR', campusId: (await getDefaultCampus(workspace.id)).id, reason: 'x' });
    expect(res.status).toBe(409);
  });

  it('404s an admin id from another workspace', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AR6' });
    const { agent: otherAgent } = await signupAdmin(app, { workspaceCode: 'AR6B' });
    const otherAdminId = (await otherAgent.get('/api/admin-users')).body.admins[0].id;

    const res = await agent.patch(`/api/admin-users/${otherAdminId}/role`).send({ newRole: 'CEO', reason: 'hijack' });
    expect(res.status).toBe(404);
  });

  it('only ADMIN/CEO can hit this endpoint', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AR7' });
    const defaultCampus = await getDefaultCampus(workspace.id);
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@ar7.example', 'DIRECTOR', { campusId: defaultCampus.id });
    const target = (await agent.post('/api/admin-users').send({ email: 'x@ar7.example', password: 'pw123456', role: 'ADMIN' })).body;

    const res = await directorAgent.patch(`/api/admin-users/${target.id}/role`).send({ newRole: 'CEO', reason: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('deactivate / activate', () => {
  it('cannot deactivate your own account', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'AD15' });
    const self = (await agent.get('/api/admin-users')).body.admins[0];

    const res = await agent.post(`/api/admin-users/${self.id}/deactivate`);
    expect(res.status).toBe(409);
  });

  it('cannot deactivate the last remaining active ADMIN/CEO', async () => {
    // Three unrestricted admins: root (signup), CEO, and a second ADMIN —
    // whittle down to one, then confirm the last one is protected even by
    // a still-authenticated session belonging to an already-deactivated
    // admin (requireRole checks the session, not a live DB lookup — an
    // accepted limitation, see lib/campusScope.ts's session-staleness note
    // from Phase 1 — so root's session is still usable here after being
    // deactivated in step 1, which is exactly what lets this test reach
    // the "last admin" case with only two agents).
    const { agent: rootAgent, workspace } = await signupAdmin(app, { workspaceCode: 'AD16' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@ad16.example', 'CEO');
    const third = (await rootAgent.post('/api/admin-users').send({ email: 'third@ad16.example', password: 'pw123456', role: 'ADMIN' })).body;

    const rootSelf = (await rootAgent.get('/api/admin-users')).body.admins.find((a: any) => a.email !== 'ceo@ad16.example' && a.email !== 'third@ad16.example');

    // root deactivates third — 2 active unrestricted admins remain (root, ceo).
    expect((await rootAgent.post(`/api/admin-users/${third.id}/deactivate`)).status).toBe(200);
    // ceo deactivates root — 1 remains (ceo). Allowed.
    expect((await ceoAgent.post(`/api/admin-users/${rootSelf.id}/deactivate`)).status).toBe(200);

    const ceoSelf = (await ceoAgent.get('/api/admin-users')).body.admins.find((a: any) => a.email === 'ceo@ad16.example');
    // root's session is still authenticated (stale but valid) — attempting
    // to deactivate ceo, the last active unrestricted admin, is blocked.
    expect((await rootAgent.post(`/api/admin-users/${ceoSelf.id}/deactivate`)).status).toBe(409);
  });

  it('deactivated admin cannot log in, and can log in again after reactivation', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AD17' });
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@ad17.example', 'CEO');
    const target = (
      await agent.post('/api/admin-users').send({ email: 'dir@ad17.example', password: 'pw123456', role: 'ADMIN' })
    ).body;

    expect((await ceoAgent.post(`/api/admin-users/${target.id}/deactivate`)).status).toBe(200);
    const blockedLogin = await agent.post('/api/auth/admin/login').send({ workspaceCode: workspace.workspaceCode, email: 'dir@ad17.example', password: 'pw123456' });
    expect(blockedLogin.status).toBe(401);

    expect((await ceoAgent.post(`/api/admin-users/${target.id}/activate`)).status).toBe(200);
    const allowedLogin = await agent.post('/api/auth/admin/login').send({ workspaceCode: workspace.workspaceCode, email: 'dir@ad17.example', password: 'pw123456' });
    expect(allowedLogin.status).toBe(200);
  });
});
