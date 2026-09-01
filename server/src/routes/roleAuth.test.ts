import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../db';
import { requireRole, requireAnyActor } from '../middleware/auth';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

// Test-only routes exercising requireRole/req.session.role in isolation.
// Deliberately NOT added to app.ts — the middleware isn't wired into any
// production route yet, so these exist only to drive it here.
app.get('/api/test/session-role', requireAnyActor, (req, res) => res.json({ role: req.session.role ?? null }));
app.get('/api/test/role-gate-admin-ceo', requireRole('ADMIN', 'CEO'), (_req, res) => res.json({ ok: true }));
app.get('/api/test/role-gate-ceo-only', requireRole('CEO'), (_req, res) => res.json({ ok: true }));
app.post('/api/test/role-gate-admin', requireRole('ADMIN'), (_req, res) => res.json({ ok: true }));

beforeEach(async () => {
  await resetDb();
});

describe('session role assignment at login', () => {
  it('admin signup defaults to ADMIN and stores it in the session', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE1', email: 'boss@role1.example' });
    const res = await agent.get('/api/test/session-role');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('admin login re-derives role from the DB record, reflecting a role changed after signup', async () => {
    const { workspace, email, password } = await signupAdmin(app, { workspaceCode: 'ROLE2', email: 'boss@role2.example' });
    await prisma.adminUser.update({
      where: { workspaceId_email: { workspaceId: workspace.id, email } },
      data: { role: 'CEO' },
    });

    const agent = request.agent(app);
    await agent.post('/api/auth/admin/login').send({ workspaceCode: 'ROLE2', email, password });

    const res = await agent.get('/api/test/session-role');
    expect(res.body.role).toBe('CEO');
  });

  it('employee login implicitly sets role to COACH', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE3' });
    await agent.post('/api/employees').send({ name: 'Riley', pin: '5555' });

    const { agent: empAgent } = await loginEmployee(app, 'ROLE3', '5555');
    const res = await empAgent.get('/api/test/session-role');
    expect(res.body.role).toBe('COACH');
  });
});

describe('requireRole middleware', () => {
  it('allows a session whose role matches one of the allowed roles', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE4' }); // defaults to ADMIN
    const res = await agent.get('/api/test/role-gate-admin-ceo');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('404s a session whose role does not match any allowed role', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE5' }); // ADMIN, gate only allows CEO
    const res = await agent.get('/api/test/role-gate-ceo-only');
    expect(res.status).toBe(404);
  });

  it('404s an unauthenticated request rather than 401', async () => {
    const res = await request(app).get('/api/test/role-gate-admin-ceo');
    expect(res.status).toBe(404);
  });

  it('404s an employee (COACH) session against an ADMIN/CEO-gated route', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE6' });
    await agent.post('/api/employees').send({ name: 'Jamie', pin: '6666' });
    const { agent: empAgent } = await loginEmployee(app, 'ROLE6', '6666');

    const res = await empAgent.get('/api/test/role-gate-admin-ceo');
    expect(res.status).toBe(404);
  });
});

describe('role is never accepted from client input', () => {
  it('a role in the signup request body is ignored — the created admin is still ADMIN', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/admin/signup').send({
      workspaceName: 'Sneaky Co',
      workspaceCode: 'ROLE7',
      email: 'sneaky@role7.example',
      password: 'password123',
      role: 'CEO',
    });
    expect(res.status).toBe(201);

    const stored = await prisma.adminUser.findUnique({
      where: { workspaceId_email: { workspaceId: res.body.workspace.id, email: 'sneaky@role7.example' } },
    });
    expect(stored?.role).toBe('ADMIN');

    // And the session reflects the real (default) role, not the claimed one.
    const sessionRes = await agent.get('/api/test/session-role');
    expect(sessionRes.body.role).toBe('ADMIN');
    expect((await agent.get('/api/test/role-gate-ceo-only')).status).toBe(404);
  });

  it('a role in the request body/query of a gated route is ignored — only req.session.role is consulted', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'ROLE8' }); // ADMIN

    // Body claims CEO on an ADMIN-gated route it already qualifies for — should still just pass as ADMIN, not escalate.
    const passRes = await agent.post('/api/test/role-gate-admin').send({ role: 'CEO' });
    expect(passRes.status).toBe(200);

    await agent.post('/api/employees').send({ name: 'Sam', pin: '7777' });
    const { agent: empAgent } = await loginEmployee(app, 'ROLE8', '7777'); // COACH

    // COACH session claiming role=ADMIN in the body/query must not pass an ADMIN-only gate.
    const bodyRes = await empAgent.post('/api/test/role-gate-admin').send({ role: 'ADMIN' });
    expect(bodyRes.status).toBe(404);

    const queryRes = await empAgent.get('/api/test/role-gate-admin-ceo').query({ role: 'ADMIN' });
    expect(queryRes.status).toBe(404);
  });
});
