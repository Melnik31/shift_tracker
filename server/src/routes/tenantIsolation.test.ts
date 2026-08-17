import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

// These tests exist because every route re-derives workspaceId from
// req.session and re-checks a target row's ancestry before allowing access
// (see the "ownership-chain helpers" comment in routes/layout.ts). This
// suite pins that contract down: workspace B must never be able to read,
// modify, or delete workspace A's data by guessing/reusing an id, and a
// cross-tenant id should look identical to a nonexistent one (404, not 403
// or 200) so existence isn't leaked either.

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

async function setupTwoWorkspaces() {
  const a = await signupAdmin(app, { workspaceCode: 'TENANT-A' });
  const b = await signupAdmin(app, { workspaceCode: 'TENANT-B' });
  return { a, b };
}

describe('tenant isolation', () => {
  it('workspace B cannot patch or delete workspace A\'s layout (section/location/subrow)', async () => {
    const { a, b } = await setupTwoWorkspaces();

    const section = (await a.agent.post('/api/layout/sections').send({ name: 'A Section' })).body;
    const location = (await a.agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'A Location' })).body;
    const subRow = (
      await a.agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'A Row', dataType: 'STATUS' })
    ).body;

    expect((await b.agent.patch(`/api/layout/sections/${section.id}`).send({ name: 'hijacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/layout/sections/${section.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/layout/locations/${location.id}`).send({ name: 'hijacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/layout/locations/${location.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/layout/subrows/${subRow.id}`).send({ label: 'hijacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/layout/subrows/${subRow.id}`)).status).toBe(404);

    // Untouched: A still sees its original data.
    const aLayout = await a.agent.get('/api/layout');
    expect(aLayout.body.sections).toHaveLength(1);
    expect(aLayout.body.sections[0].name).toBe('A Section');

    // B's own tree is empty — A's data never leaked into B's view.
    const bLayout = await b.agent.get('/api/layout');
    expect(bLayout.body.sections).toHaveLength(0);
  });

  it('B cannot create a location/subrow under A\'s section by passing A\'s id', async () => {
    const { a, b } = await setupTwoWorkspaces();
    const section = (await a.agent.post('/api/layout/sections').send({ name: 'A Section' })).body;

    const res = await b.agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'sneaky' });
    expect(res.status).toBe(404);
  });

  it('workspace B cannot read, patch, or delete workspace A\'s employees', async () => {
    const { a, b } = await setupTwoWorkspaces();

    const employee = (await a.agent.post('/api/employees').send({ name: 'A Employee', pin: '1111' })).body;

    expect((await b.agent.patch(`/api/employees/${employee.id}`).send({ name: 'hijacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/employees/${employee.id}`)).status).toBe(404);

    const bList = await b.agent.get('/api/employees');
    expect(bList.body.employees).toHaveLength(0);

    const aList = await a.agent.get('/api/employees');
    expect(aList.body.employees).toHaveLength(1);
    expect(aList.body.employees[0].name).toBe('A Employee');
  });

  it('workspace B cannot patch or delete workspace A\'s shifts or cell values', async () => {
    const { a, b } = await setupTwoWorkspaces();

    const section = (await a.agent.post('/api/layout/sections').send({ name: 'S' })).body;
    const location = (await a.agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'L' })).body;
    const subRow = (
      await a.agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Row', dataType: 'TEXT' })
    ).body;
    const shift = (
      await a.agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellValueId = shift.cellValues[0].id;

    expect((await b.agent.patch(`/api/shifts/${shift.id}`).send({ startTime: '10:00' })).status).toBe(404);
    expect((await b.agent.patch(`/api/shifts/cells/${cellValueId}`).send({ textValue: 'hijacked' })).status).toBe(404);
    expect((await b.agent.delete(`/api/shifts/${shift.id}`)).status).toBe(404);

    // A's shift survived every attempt from B.
    const aShifts = await a.agent.get('/api/shifts').query({ date: '2026-08-17' });
    expect(aShifts.body.shifts).toHaveLength(1);
    expect(aShifts.body.shifts[0].cellValues[0].textValue).toBeNull();
  });

  it('assigning staff to a cell silently drops employee ids from another workspace', async () => {
    const { a, b } = await setupTwoWorkspaces();

    const bEmployee = (await b.agent.post('/api/employees').send({ name: 'B Employee', pin: '2222' })).body;

    const section = (await a.agent.post('/api/layout/sections').send({ name: 'S' })).body;
    const location = (await a.agent.post('/api/layout/locations').send({ sectionId: section.id, name: 'L' })).body;
    const subRow = (
      await a.agent.post('/api/layout/subrows').send({ locationId: location.id, label: 'Staff', dataType: 'STAFF' })
    ).body;
    const shift = (
      await a.agent.post('/api/shifts').send({ subRowId: subRow.id, date: '2026-08-17', startTime: '09:00', endTime: '17:00' })
    ).body;
    const cellValueId = shift.cellValues[0].id;

    // A (authenticated, owns the cell) tries to assign B's employee id to it.
    const res = await a.agent.patch(`/api/shifts/cells/${cellValueId}`).send({ staffEmployeeIds: [bEmployee.id] });
    expect(res.status).toBe(200);
    expect(res.body.staffAssignments).toHaveLength(0);
  });

  it('an employee session (not admin) is rejected by admin-only CRUD routes', async () => {
    const { a } = await setupTwoWorkspaces();
    await a.agent.post('/api/employees').send({ name: 'Worker', pin: '3333' });

    const { agent: empAgent } = await loginEmployee(app, 'TENANT-A', '3333');

    expect((await empAgent.get('/api/layout')).status).toBe(401);
    expect((await empAgent.post('/api/employees').send({ name: 'x', pin: '0000' })).status).toBe(401);
    expect((await empAgent.get('/api/shifts').query({ date: '2026-08-17' })).status).toBe(401);
  });
});
