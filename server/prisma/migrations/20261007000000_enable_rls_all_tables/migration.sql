-- Supabase exposes every table in the `public` schema through its REST API
-- (PostgREST) using the public `anon` key. With row level security off, that
-- key alone could read or write all tenant data, bypassing the Express app
-- and its campus scoping. Enabling RLS with no policies denies `anon` and
-- `authenticated` entirely. The app is unaffected: Prisma connects as the
-- table owner (bypasses RLS) and Storage uses the service-role key.
-- (_prisma_migrations already has RLS: 20260916000000_enable_rls_prisma_migrations.)

-- AlterTable
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoleChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeOffRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeCampus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Location" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CellValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedBadgeColor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CellStaffAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollPeriodReopen" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollAdjustment" ENABLE ROW LEVEL SECURITY;

-- connect-pg-simple creates the "session" table at runtime, so it may not
-- exist yet on a fresh database; cover it when it does.
DO $$
BEGIN
  IF to_regclass('public.session') IS NOT NULL THEN
    ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Defence in depth: also take away the REST roles' table privileges, and make
-- that the default for tables created later. Supabase-only roles, so this is
-- skipped on plain Postgres (local dev, CI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  END IF;
END $$;
