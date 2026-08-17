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
