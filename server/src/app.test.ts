import { describe, it, expect, afterEach, vi } from 'vitest';

// isProduction/SESSION_SECRET are read once at module-evaluation time, so
// exercising both branches means forcing a fresh import of the module
// under each env, not just mutating process.env before calling createApp().
//
// Set (not delete) SESSION_SECRET to represent "unset" — createApp()
// transitively imports ./db, which instantiates PrismaClient, and Prisma
// reloads the real .env file as a side effect of that (see index.ts's own
// comment on this). dotenv only skips keys that already exist in
// process.env regardless of value, so `delete` lets that reload silently
// repopulate SESSION_SECRET from disk, while an empty string survives it.
describe('createApp SESSION_SECRET guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SESSION_SECRET = originalSecret;
    vi.resetModules();
  });

  it('refuses to start in production without SESSION_SECRET set', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = '';
    const { createApp } = await import('./app');
    expect(() => createApp()).toThrow('SESSION_SECRET must be set in production');
  });

  it('starts fine in production when SESSION_SECRET is set', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'a-real-secret';
    const { createApp } = await import('./app');
    expect(() => createApp()).not.toThrow();
  });

  it('starts fine outside production even without SESSION_SECRET set', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = '';
    const { createApp } = await import('./app');
    expect(() => createApp()).not.toThrow();
  });
});
