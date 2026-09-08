import { execSync } from 'child_process';
import path from 'path';

// Runs once for the whole vitest process (before any test file's imports
// are evaluated). Pushes the Prisma schema into the dedicated
// shifttracker_test Postgres database (see docker-compose.yml) so tests
// never touch the dev database's data. Each test's own resetDb() call
// (testUtils/resetDb.ts) clears rows before it runs, so this only needs to
// keep the schema itself in sync — not wipe anything up front.
//
// This will print a "dropping the session table" warning — db push
// reconciles the whole database to match schema.prisma, and connect-pg-
// simple's `session` table (app.ts) isn't a Prisma model, so push treats it
// as drift and drops it every run. Harmless: it's scoped to shifttracker_test
// only, and the table is recreated the next time anything logs in during
// tests. `prisma migrate deploy` (used in production, see .github/workflows)
// only replays committed migrations and never does this kind of
// drift-reconciliation, so the real session table is never at risk.
const SERVER_ROOT = path.join(__dirname, '..', '..');

export async function setup() {
  const TEST_DATABASE_URL = 'postgresql://shifttracker:shifttracker@localhost:5432/shifttracker_test';
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: SERVER_ROOT,
    // schema.prisma's directUrl needs to resolve too, even though there's
    // no pooler locally to make the two URLs actually different.
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
