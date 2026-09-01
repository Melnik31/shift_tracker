import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee, seedAdminWithRole } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('analytics read routes', () => {
  it('returns the workspace-wide overview for a date range', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.get('/api/analytics/overview').query({ start: '2026-08-01', end: '2026-08-07' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('employees');
    expect(res.body).toHaveProperty('totals');
  });

  it('404s an employeeId that does not belong to the caller\'s workspace', async () => {
    const { agent } = await signupAdmin(app);
    const res = await agent.get('/api/analytics/breaks').query({ employeeId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});

describe('analytics role gating (requireRole DIRECTOR/ADMIN/CEO)', () => {
  it('404s a COACH session (employee login)', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'AROLE1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await coachAgent.get('/api/analytics/overview')).status).toBe(404);
    expect((await coachAgent.get('/api/analytics/breaks').query({ employeeId: 'x' })).status).toBe(404);
  });

  it('DIRECTOR, ADMIN, and CEO all succeed identically on these read-only routes', async () => {
    const { agent: adminAgent, workspace } = await signupAdmin(app, { workspaceCode: 'AROLE2' });
    const directorAgent = await seedAdminWithRole(app, workspace.id, 'director@arole2.example', 'DIRECTOR');
    const ceoAgent = await seedAdminWithRole(app, workspace.id, 'ceo@arole2.example', 'CEO');
    const employee = (await adminAgent.post('/api/employees').send({ name: 'Emp', pin: '2222' })).body;

    for (const agent of [adminAgent, directorAgent, ceoAgent]) {
      expect((await agent.get('/api/analytics/overview').query({ start: '2026-08-01', end: '2026-08-07' })).status).toBe(200);
      expect((await agent.get('/api/analytics/breaks').query({ employeeId: employee.id })).status).toBe(200);
    }
  });
});
