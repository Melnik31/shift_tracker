import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app';
import { resetDb } from '../testUtils/resetDb';
import { signupAdmin, loginEmployee } from '../testUtils/authHelpers';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

describe('badge colors role gating (requireRole DIRECTOR/SENIOR_LEAD_INSTRUCTOR/ADMIN/CEO)', () => {
  it('404s a COACH session', async () => {
    const { agent, workspace } = await signupAdmin(app, { workspaceCode: 'BC1' });
    await agent.post('/api/employees').send({ name: 'Worker', pin: '1111' });
    const { agent: coachAgent } = await loginEmployee(app, workspace.workspaceCode, '1111');

    expect((await coachAgent.get('/api/badge-colors')).status).toBe(404);
    expect((await coachAgent.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' })).status).toBe(404);
  });
});

describe('saving and listing badge colors', () => {
  it('saves a new named color and lists it back, newest first', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'BC2' });

    const first = await agent.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' });
    expect(first.status).toBe(201);
    expect(first.body.color).toBe('#ff6b35');
    expect(first.body.label).toBe('Home');

    const second = await agent.post('/api/badge-colors').send({ color: '#1e90ff', label: 'Away' });
    expect(second.status).toBe(201);

    const listed = await agent.get('/api/badge-colors');
    expect(listed.status).toBe(200);
    expect(listed.body.colors.map((c: { color: string; label: string }) => [c.color, c.label])).toEqual([
      ['#1e90ff', 'Away'],
      ['#ff6b35', 'Home'],
    ]);
  });

  it('rejects a value that is not a 6-digit hex color', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'BC3' });
    expect((await agent.post('/api/badge-colors').send({ color: 'not-a-color', label: 'Home' })).status).toBe(400);
    expect((await agent.post('/api/badge-colors').send({ color: '#fff', label: 'Home' })).status).toBe(400);
    expect((await agent.post('/api/badge-colors').send({ label: 'Home' })).status).toBe(400);
  });

  it('rejects a missing or blank label', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'BC3B' });
    expect((await agent.post('/api/badge-colors').send({ color: '#ff6b35' })).status).toBe(400);
    expect((await agent.post('/api/badge-colors').send({ color: '#ff6b35', label: '   ' })).status).toBe(400);
  });

  it('saving the same color twice does not create a duplicate', async () => {
    const { agent } = await signupAdmin(app, { workspaceCode: 'BC4' });
    await agent.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' });
    const again = await agent.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' });
    expect(again.status).toBe(200);

    const listed = await agent.get('/api/badge-colors');
    expect(listed.body.colors).toHaveLength(1);
  });

  it('a saved color is only visible within its own workspace', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'BC5' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'BC6' });
    await a.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' });

    const listedByB = await b.get('/api/badge-colors');
    expect(listedByB.body.colors).toEqual([]);
  });

  it('deletes a saved color, and 404s deleting one that does not exist or belongs to another workspace', async () => {
    const { agent: a } = await signupAdmin(app, { workspaceCode: 'BC7' });
    const { agent: b } = await signupAdmin(app, { workspaceCode: 'BC8' });
    const saved = (await a.post('/api/badge-colors').send({ color: '#ff6b35', label: 'Home' })).body;

    expect((await b.delete(`/api/badge-colors/${saved.id}`)).status).toBe(404);
    expect((await a.delete(`/api/badge-colors/${saved.id}`)).status).toBe(200);
    expect((await a.get('/api/badge-colors')).body.colors).toEqual([]);
    expect((await a.delete(`/api/badge-colors/${saved.id}`)).status).toBe(404);
  });
});
