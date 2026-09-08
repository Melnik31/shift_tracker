-- POSTGRES_DB (shifttracker_dev) is created automatically by the postgres
-- image's entrypoint; this script (run once, on first container init only)
-- adds the separate database vitest.config.ts points at, so tests never
-- share data with local dev — see server/vitest.config.ts and
-- server/src/testUtils/globalSetup.ts.
CREATE DATABASE shifttracker_test;
