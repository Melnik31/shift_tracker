import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Runs once for the whole vitest process (before any test file's imports are
// evaluated). Pushes the Prisma schema into a throwaway SQLite file so tests
// never touch server/prisma/dev.db (the real seeded demo data).
const SERVER_ROOT = path.join(__dirname, '..', '..');
const TEST_DB_PATH = path.join(SERVER_ROOT, 'prisma', 'test.db');

function removeTestDbFiles() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

export async function setup() {
  removeTestDbFiles();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
    stdio: 'inherit',
  });
}

export async function teardown() {
  removeTestDbFiles();
}
