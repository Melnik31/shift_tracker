import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL = 'postgresql://shifttracker:shifttracker@localhost:5432/shifttracker_test';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // Overrides just these two — everything else (SUPABASE_URL,
      // SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET) passes through
      // from the real server/.env via the dotenv import above, so file
      // upload tests exercise the same real Storage bucket dev does,
      // mirroring how tests already use a real (separate) Postgres
      // database rather than mocking Prisma.
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      SESSION_SECRET: 'test-secret',
    },
    globalSetup: ['./src/testUtils/globalSetup.ts'],
    // Every test file shares this one database and each test wipes it via
    // resetDb() (see testUtils/resetDb.ts) before running — running test
    // files concurrently would let one file's reset stomp on another's
    // still-running assertions, regardless of which database engine is
    // behind it. Not a SQLite-specific constraint.
    fileParallelism: false,
  },
});
