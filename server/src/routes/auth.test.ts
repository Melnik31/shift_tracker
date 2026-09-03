import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../db';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/auth/admin/signup', () => {
  it('creates a workspace + admin and logs the admin in', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'ACME1', email: 'boss@acme.example' });
    expect(workspace.workspaceCode).toBe('ACME1');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.actorType).toBe('admin');
    expect(me.body.admin.email).toBe('boss@acme.example');
    expect(me.body.workspace.workspaceCode).toBe('ACME1');
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/admin/signup').send({ workspaceName: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate workspace code', async () => {
    await signupAdmin(app, { workspaceCode: 'DUPE1' });
    const res = await request(app)
      .post('/api/auth/admin/signup')
      .send({ workspaceName: 'Other', workspaceCode: 'DUPE1', email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/admin/login', () => {
  it('logs in with correct credentials', async () => {
    await signupAdmin(app, { workspaceCode: 'LOGIN1', email: 'admin@login1.example', password: 'correct-horse' });

    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/admin/login')
      .send({ workspaceCode: 'LOGIN1', email: 'admin@login1.example', password: 'correct-horse' });
    expect(res.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.body.actorType).toBe('admin');
  });

  it('rejects a wrong password without leaking which part was wrong', async () => {
    await signupAdmin(app, { workspaceCode: 'LOGIN2', email: 'admin@login2.example', password: 'correct-horse' });

    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: 'LOGIN2', email: 'admin@login2.example', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('rejects an unknown workspace code', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: 'NOPE', email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('rejects an email that belongs to a different workspace', async () => {
    await signupAdmin(app, { workspaceCode: 'LOGIN3A', email: 'shared@example.com', password: 'pw-a' });
    await signupAdmin(app, { workspaceCode: 'LOGIN3B', email: 'other@example.com', password: 'pw-b' });

    // Right password, but for the wrong tenant's workspaceCode.
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: 'LOGIN3B', email: 'shared@example.com', password: 'pw-a' });
    expect(res.status).toBe(401);
  });

  it('the founding admin from signup never has mustChangePassword set', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'LOGIN4', email: 'admin@login4.example', password: 'correct-horse' });
    const res = await agent.post('/api/auth/admin/login').send({ workspaceCode: 'LOGIN4', email: 'admin@login4.example', password: 'correct-horse' });
    expect(res.body.mustChangePassword).toBe(false);
  });

  it('an admin created via POST /api/admin-users has mustChangePassword: true on login, until they change it', async () => {
    const { agent: rootAgent, workspace } = await signupAdmin(app, { workspaceCode: 'LOGIN5' });
    await rootAgent.post('/api/admin-users').send({ email: 'new@login5.example', password: 'temp-pw-123', role: 'ADMIN' });

    const firstLogin = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: workspace.workspaceCode, email: 'new@login5.example', password: 'temp-pw-123' });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.mustChangePassword).toBe(true);

    const newAdminAgent = request.agent(app);
    await newAdminAgent.post('/api/auth/admin/login').send({ workspaceCode: workspace.workspaceCode, email: 'new@login5.example', password: 'temp-pw-123' });
    const changed = await newAdminAgent.post('/api/auth/admin/change-password').send({ newPassword: 'a-real-password-now' });
    expect(changed.status).toBe(200);

    const secondLogin = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: workspace.workspaceCode, email: 'new@login5.example', password: 'a-real-password-now' });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.mustChangePassword).toBe(false);

    // The old temp password no longer works.
    const oldPasswordLogin = await request(app)
      .post('/api/auth/admin/login')
      .send({ workspaceCode: workspace.workspaceCode, email: 'new@login5.example', password: 'temp-pw-123' });
    expect(oldPasswordLogin.status).toBe(401);
  });
});

describe('POST /api/auth/admin/change-password', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/admin/change-password').send({ newPassword: 'whatever12345' });
    expect(res.status).toBe(401);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'CHPW1' });
    const res = await agent.post('/api/auth/admin/change-password').send({ newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('/me reflects mustChangePassword going false immediately after a successful change', async () => {
    const { agent: rootAgent, workspace } = await signupAdmin(app, { workspaceCode: 'CHPW2' });
    await rootAgent.post('/api/admin-users').send({ email: 'new@chpw2.example', password: 'temp-pw-123', role: 'ADMIN' });

    const newAdminAgent = request.agent(app);
    await newAdminAgent.post('/api/auth/admin/login').send({ workspaceCode: workspace.workspaceCode, email: 'new@chpw2.example', password: 'temp-pw-123' });
    expect((await newAdminAgent.get('/api/auth/me')).body.admin.mustChangePassword).toBe(true);

    await newAdminAgent.post('/api/auth/admin/change-password').send({ newPassword: 'a-real-password-now' });
    expect((await newAdminAgent.get('/api/auth/me')).body.admin.mustChangePassword).toBe(false);
  });
});

describe('POST /api/auth/employee/login', () => {
  async function seedEmployee(workspaceId: string) {
    const bcrypt = await import('bcryptjs');
    return prisma.employee.create({
      data: { workspaceId, name: 'Riley Chen', role: 'Guard', pinHash: bcrypt.hashSync('1234', 10) },
    });
  }

  it('logs in with the correct PIN', async () => {
    const { workspace } = await signupAdmin(app, { workspaceCode: 'EMP1' });
    await seedEmployee(workspace.id);

    const { agent, employee } = await loginEmployee(app, 'EMP1', '1234');
    expect(employee.name).toBe('Riley Chen');

    const me = await agent.get('/api/auth/me');
    expect(me.body.actorType).toBe('employee');
    expect(me.body.employee.name).toBe('Riley Chen');
  });

  it('rejects a wrong PIN', async () => {
    const { workspace } = await signupAdmin(app, { workspaceCode: 'EMP2' });
    await seedEmployee(workspace.id);

    const res = await request(app).post('/api/auth/employee/login').send({ workspaceCode: 'EMP2', pin: '9999' });
    expect(res.status).toBe(401);
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/employee/login').send({ workspaceCode: 'EMP2' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout and GET /api/auth/me', () => {
  it('me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('logout destroys the session so subsequent /me is unauthenticated', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'OUT1' });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});
