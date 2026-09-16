-- Supabase's linter flags any table in the `public` schema (exposed to
-- PostgREST) that doesn't have row level security enabled. `_prisma_migrations`
-- is Prisma's own internal bookkeeping table, never queried by the app or
-- PostgREST — enabling RLS with no policies denies all API access to it
-- (Prisma itself connects as the table owner via DATABASE_URL, so it bypasses
-- RLS and `prisma migrate` keeps working normally).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
