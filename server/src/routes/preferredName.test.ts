import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

type Agent = Awaited<ReturnType<typeof signupAdmin>>['agent'];

describe('full name and preferred name', () => {
  it('requires a non-blank full name to add a coach, and trims it', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PN1' });
    expect((await agent.post('/api/employees').send({ pin: '1111' })).status).toBe(400);
    expect((await agent.post('/api/employees').send({ name: '   ', pin: '1111' })).status).toBe(400);

    const res = await agent.post('/api/employees').send({ name: '  Mikhail Melnikov ', pin: '1111' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mikhail Melnikov');
    expect(res.body.preferredName).toBeNull();
  });

  it('saves, trims, and clears a coach preferred name; the full name cannot be blanked', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PN2' });
    const created = (await agent.post('/api/employees').send({ name: 'Mikhail Melnikov', preferredName: ' Mike ', pin: '1111' })).body;
    expect(created.preferredName).toBe('Mike');

    expect((await agent.patch(`/api/employees/${created.id}`).send({ name: '' })).status).toBe(400);
    expect((await agent.patch(`/api/employees/${created.id}`).send({ preferredName: 'x'.repeat(61) })).status).toBe(400);

    const cleared = await agent.patch(`/api/employees/${created.id}`).send({ preferredName: '' });
    expect(cleared.body.preferredName).toBeNull();
    expect(cleared.body.name).toBe('Mikhail Melnikov');
  });

  it('requires a full name to create an admin of any role, and stores the preferred name', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PN3' });
    const base = { email: 'dir@pn3.example', password: 'pw123456', role: 'ADMIN' };
    expect((await agent.post('/api/admin-users').send(base)).status).toBe(400);
    expect((await agent.post('/api/admin-users').send({ ...base, name: '  ' })).status).toBe(400);

    const res = await agent.post('/api/admin-users').send({ ...base, name: 'Dana Whitfield', preferredName: 'Dani' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Dana Whitfield', preferredName: 'Dani' });

    const edited = await agent.patch(`/api/admin-users/${res.body.id}`).send({ preferredName: '' });
    expect(edited.body.preferredName).toBeNull();
    expect((await agent.patch(`/api/admin-users/${res.body.id}`).send({ name: ' ' })).status).toBe(400);
  });

  async function scheduleCoach(agent: Agent, date: string) {
    const section = (await agent.post('/api/layout/sections').send({ name: 'Ice' })).body;
    const location = (await agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'Rink A' })).body;
    const staff = (await agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Coach', dataType: 'STAFF' })).body;
    const coach = (await agent.post('/api/employees').send({ name: 'Mikhail Melnikov', preferredName: 'Mike', pin: '1111' })).body;
    const shift = (await agent.post('/api/shifts').send({ subRowId: staff.id, date, startTime: '09:00', endTime: '11:00', sessionType: 'Ice Session' })).body;
    await agent.patch(`/api/shifts/cells/${shift.cellValues[0].id}`).send({ staffEmployeeIds: [coach.id] });
    return coach;
  }

  it('schedule payloads carry the preferred name; payroll detail and CSV use the full name', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'PN4' });
    const date = '2026-09-10';
    await scheduleCoach(agent, date);

    const shifts = (await agent.get('/api/shifts').query({ date })).body.shifts;
    const assigned = shifts[0].cellValues[0].staffAssignments[0].employee;
    expect(assigned).toMatchObject({ name: 'Mikhail Melnikov', preferredName: 'Mike' });

    const me = await loginEmployee(app, 'PN4', '1111');
    expect((await me.agent.get('/api/auth/me')).body.employee).toMatchObject({ name: 'Mikhail Melnikov', preferredName: 'Mike' });

    const period = (await agent.post('/api/payroll/periods').send({ start: date, end: date })).body;
    const detail = (await agent.get(`/api/payroll/periods/${period.id}`)).body;
    expect(detail.employees.map((e: { employeeName: string }) => e.employeeName)).toEqual(['Mikhail Melnikov']);

    await agent.post(`/api/payroll/periods/${period.id}/review`);
    await agent.post(`/api/payroll/periods/${period.id}/approve`);
    const csv = await agent.get(`/api/payroll/periods/${period.id}/export`);
    expect(csv.text).toContain('Mikhail Melnikov');
    expect(csv.text).not.toContain('Mike,');
  });
});
