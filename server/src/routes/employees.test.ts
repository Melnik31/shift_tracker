import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('employees CRUD', () => {
  it('creates, lists, updates, and deletes an employee', async () => {
    const { agent } = await signupAdmin(app);

    const created = await agent.post('/api/employees').send({ name: 'Sam Patel', role: 'Guard', pin: '1234' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Sam Patel');
    // pinHash must never be echoed back to the client.
    expect(created.body.pinHash).toBeUndefined();
    expect(created.body.pin).toBeUndefined();

    const listed = await agent.get('/api/employees');
    expect(listed.body.employees).toHaveLength(1);
    expect(listed.body.employees[0]).not.toHaveProperty('pinHash');

    const patched = await agent.patch(`/api/employees/${created.body.id}`).send({ role: 'Lead Guard' });
    expect(patched.status).toBe(200);
    expect(patched.body.role).toBe('Lead Guard');

    const deleted = await agent.delete(`/api/employees/${created.body.id}`);
    expect(deleted.status).toBe(200);
    expect((await agent.get('/api/employees')).body.employees).toHaveLength(0);
  });

  it('rejects creation without a name or pin', async () => {
    const { agent } = await signupAdmin(app);
    expect((await agent.post('/api/employees').send({ pin: '1234' })).status).toBe(400);
    expect((await agent.post('/api/employees').send({ name: 'No Pin' })).status).toBe(400);
  });

  it('rejects a pin that is not exactly 4 digits', async () => {
    const { agent } = await signupAdmin(app);
    expect((await agent.post('/api/employees').send({ name: 'X', pin: '123' })).status).toBe(400);
    expect((await agent.post('/api/employees').send({ name: 'X', pin: '12345' })).status).toBe(400);
    expect((await agent.post('/api/employees').send({ name: 'X', pin: 'abcd' })).status).toBe(400);
  });

  it('rejects an invalid pin on update, leaving the existing pin usable', async () => {
    const { agent, workspaceCode } = await signupAdmin(app);
    const created = await agent.post('/api/employees').send({ name: 'X', pin: '1234' });

    const badUpdate = await agent.patch(`/api/employees/${created.body.id}`).send({ pin: 'bad' });
    expect(badUpdate.status).toBe(400);

    const login = await loginEmployee(app, workspaceCode, '1234');
    expect(login.employee.name).toBe('X');
  });

  it('updating the pin changes which PIN logs the employee in', async () => {
    const { agent, workspaceCode } = await signupAdmin(app);
    const created = await agent.post('/api/employees').send({ name: 'X', pin: '1234' });

    await agent.patch(`/api/employees/${created.body.id}`).send({ pin: '5678' });

    await expect(loginEmployee(app, workspaceCode, '1234')).rejects.toThrow();
    const login = await loginEmployee(app, workspaceCode, '5678');
    expect(login.employee.id).toBe(created.body.id);
  });

  it('404s updating/deleting an employee id that does not exist', async () => {
    const { agent } = await signupAdmin(app);
    expect((await agent.patch('/api/employees/does-not-exist').send({ name: 'x' })).status).toBe(404);
    expect((await agent.delete('/api/employees/does-not-exist')).status).toBe(404);
  });

  it('defaults role to "Employee" when omitted', async () => {
    const { agent } = await signupAdmin(app);
    const created = await agent.post('/api/employees').send({ name: 'No Role', pin: '1234' });
    expect(created.body.role).toBe('Employee');
  });
});
