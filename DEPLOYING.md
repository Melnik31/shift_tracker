# Deploying ShiftTracker

## Architecture

- **Client** (`client/`) — static Vite build, hosted on **Vercel**.
- **API** (`server/`) — a normal persistent Express process (not a
  serverless function — it holds session-cookie auth and a long-lived
  Prisma/pg connection pool), hosted on **Railway** or **Render**.
- **Database + file storage** — **Supabase** (Postgres + Storage). Nothing
  about this ties the API to Vercel specifically; Supabase is just a
  regular Postgres connection string and an S3-compatible bucket, reachable
  from wherever the API actually runs.

The client and API are deliberately on different domains. That means
cross-origin cookies (`SameSite=None; Secure`, gated by `NODE_ENV` — see
`server/src/app.ts`) and an explicit `ALLOWED_ORIGINS` allow-list instead of
same-origin defaults.

## Environment variables

Copy `server/.env.example` → `server/.env` and `client/.env.example` →
`client/.env` for local dev. **Staging and production values are never
committed** — they live in Railway's/Render's and Vercel's own
per-environment variable dashboards. Set up a distinct value for
`SESSION_SECRET` per environment, and never reuse a production secret in
staging.

### Supabase's connection pooler

Supabase project settings → Database gives you two connection strings:

- **Transaction pooler** (port 6543, PgBouncer) — use this for
  `DATABASE_URL`, what the running app connects through. Many concurrent
  requests each briefly borrowing a connection is exactly what the pooler
  is for.
- **Direct connection** (port 5432) — use this for `DIRECT_URL`.
  `prisma migrate`/`db push` run DDL and take an advisory lock, neither of
  which PgBouncer's transaction-mode pooling supports reliably. `schema.prisma`
  splits these on purpose (`url` vs `directUrl`) — see the comments there.

Locally (`docker-compose.yml`), there's no pooler at all, so both variables
just point at the same plain connection string.

## Deploying the database

Migrations are applied with `prisma migrate deploy` (not `migrate dev`) —
it only replays already-committed migration files from
`server/prisma/migrations/`, never prompts, and never generates a new
migration on its own. Safe to run unattended in CI:

```
cd server && npx prisma migrate deploy
```

Run this against staging's `DIRECT_URL` before every staging deploy, and
against production's before every production deploy — never the other way
around. `npm run db:seed` refuses to run when `NODE_ENV=production` (see
`prisma/seed.ts`) since it wipes every table before reseeding — it's a
local/demo-data tool only.

## Deploying the API (Railway/Render)

1. Point the service at `server/` as the root/build directory.
2. Build command: `npm install && npm run build` (compiles `src/` → `dist/`).
3. Start command: `npm start` (`node dist/index.js`).
4. Set every variable from `server/.env.example` in the platform's
   dashboard, with `NODE_ENV=production` and `ALLOWED_ORIGINS` set to the
   real Vercel domain(s) that should be allowed to call this API.

## Deploying the client (Vercel)

1. Point the project at `client/` as the root directory (framework preset:
   Vite).
2. Set `VITE_API_URL` to the deployed API's URL (Railway/Render gives you
   this once that service is up).
3. Vercel's preview deployments get dynamic subdomains that won't match a
   fixed `ALLOWED_ORIGINS` entry — either add the specific preview domain
   you need to the API's allow-list, or point previews at a shared staging
   API instead of expecting them to hit production.

## Staging

Staging should be a fully separate stack, not a branch of production data:

- A separate Supabase project (its own `DATABASE_URL`/`DIRECT_URL`), so
  migrations always land here first and staging testing never touches real
  payroll data.
- A separate Railway/Render service for the staging API.
- A separate Vercel project (or environment) for the staging client, on a
  stable `staging` branch rather than ad hoc preview URLs.

`.github/workflows/deploy.yml` runs on push to `staging` or `main`: tests
(against a Postgres service container plus the real Supabase Storage
bucket for that environment), then `prisma migrate deploy`, then an
explicit deploy to Railway and Vercel via their CLIs — deliberately not
relying on either platform's built-in "auto-deploy on push," since that
can't be sequenced after the migration step and could deploy code against
a schema it doesn't match yet. **Turn off native auto-deploy on both
platforms for this repo** so the two mechanisms don't race.

### One-time manual setup this repo's automation can't do for you

None of the following can be scripted from inside this repo — they're
account-level actions on each platform:

- [ ] Create a second Supabase project for staging (its own Postgres +
      Storage bucket, fully separate from production's).
- [ ] Create the staging and production **GitHub Environments** (repo
      Settings → Environments) and add each one's secrets/variables:
      `DATABASE_URL`, `DIRECT_URL`, `STAGING_SUPABASE_URL` /
      `STAGING_SUPABASE_SERVICE_ROLE_KEY` (used by the test job),
      `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`, `VERCEL_TOKEN`,
      `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — one full set per environment.
- [ ] Create the Railway service (staging) and a second one (production),
      each pointed at its own Supabase project's connection string.
- [ ] Create the Vercel project (staging) and a second one (production),
      each with its own `VITE_API_URL` pointed at the matching Railway
      service.
- [ ] Disable auto-deploy-on-push in both Railway's and Vercel's project
      settings for this repo, since `deploy.yml` now owns that.
