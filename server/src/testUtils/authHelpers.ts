import request from 'supertest';
import type { Express } from 'express';

let counter = 0;
function uniqueCode() {
  counter += 1;
  return `WS${counter}${Date.now().toString(36)}`.toUpperCase().slice(0, 16);
}

// Signs up a fresh workspace + admin via the real endpoint (not a DB
// shortcut) and returns a cookie-persisting agent already logged in as
// that admin, ready to drive CRUD/tenant-isolation tests.
export async function signupAdmin(
  app: Express,
  overrides: Partial<{ workspaceName: string; workspaceCode: string; email: string; password: string }> = {}
) {
  const agent = request.agent(app);
  const workspaceCode = overrides.workspaceCode ?? uniqueCode();
  const body = {
    workspaceName: overrides.workspaceName ?? 'Test Workspace',
    workspaceCode,
    email: overrides.email ?? 'admin@example.com',
    password: overrides.password ?? 'password123',
  };
  const res = await agent.post('/api/auth/admin/signup').send(body);
  if (res.status !== 201) throw new Error(`signupAdmin failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, workspace: res.body.workspace as { id: string; name: string; workspaceCode: string }, ...body };
}

export async function loginEmployee(app: Express, workspaceCode: string, pin: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/employee/login').send({ workspaceCode, pin });
  if (res.status !== 200) throw new Error(`loginEmployee failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, employee: res.body.employee as { id: string; name: string; role: string } };
}

// Bypasses signup (which always defaults to ADMIN) to create a second
// AdminUser in an existing workspace with an arbitrary role (and, optionally,
// a Campus assignment — see campusScopeFor), then logs them in via the real
// endpoint so their session is set up exactly like any other admin's — used
// to test requireRole gating for DIRECTOR/CEO/COACH etc. and campus scoping
// for DIRECTOR/SENIOR_LEAD_INSTRUCTOR.
export async function seedAdminWithRole(
  app: Express,
  workspaceId: string,
  email: string,
  role: string,
  options: { password?: string; campusId?: string | null } = {}
) {
  const password = options.password ?? 'elevated-pw';
  const bcrypt = await import('bcryptjs');
  const { prisma } = await import('../db');
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  await prisma.adminUser.create({
    data: { workspaceId, email, passwordHash: bcrypt.hashSync(password, 10), role, campusId: options.campusId ?? null },
  });

  const agent = request.agent(app);
  const res = await agent.post('/api/auth/admin/login').send({ workspaceCode: workspace.workspaceCode, email, password });
  if (res.status !== 200) throw new Error(`seedAdminWithRole login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

// The workspace's one auto-created default Campus (see /admin/signup and
// prisma/backfillDefaultCampus.ts). Every fresh signupAdmin() workspace has
// exactly one.
export async function getDefaultCampus(workspaceId: string) {
  const { prisma } = await import('../db');
  return prisma.campus.findFirstOrThrow({ where: { workspaceId, isDefault: true } });
}

// Creates a second Campus in an existing workspace directly via Prisma —
// bypasses POST /api/campuses so campus-isolation tests don't depend on the
// admin session that would be needed to call it.
export async function createCampus(workspaceId: string, name: string) {
  const { prisma } = await import('../db');
  return prisma.campus.create({ data: { workspaceId, name, sortOrder: 1 } });
}
