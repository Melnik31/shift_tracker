# Deploying ShiftTracker

## Architecture

- **Client** (`client/`) — static Vite build, hosted on **Vercel**.
- **API** (`server/`) — a normal persistent Express process (not a
  serverless function — it holds session-cookie auth and a long-lived
  Prisma/pg connection pool), hosted on **Render**.
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
`client/.env` for local dev. **Production values are never committed** —
they live in Render's and Vercel's own environment variable dashboards,
and in this repo's "production" GitHub Environment secrets (for
`deploy.yml`).

### Supabase's connection pooler

Supabase project settings → Database gives you three connection strings:

- **Transaction pooler** (port 6543, PgBouncer) — use this for
  `DATABASE_URL`, what the running app connects through. Many concurrent
  requests each briefly borrowing a connection is exactly what the pooler
  is for.
- **Session pooler** (port 5432, same pooler host as the transaction one)
  — use this for `DIRECT_URL`. `prisma migrate`/`db push` run DDL and take
  an advisory lock, neither of which PgBouncer's transaction-mode pooling
  supports reliably, so they need a session-level connection — but
  Supabase's actual **direct connection** (`db.<ref>.supabase.co:5432`) is
  IPv6-only, which GitHub Actions runners (and plenty of other networks)
  can't reach at all (`P1001: Can't reach database server`). The session
  pooler gives the same session-level behavior over an IPv4-reachable
  address instead. `schema.prisma` splits these on purpose (`url` vs
  `directUrl`) — see the comments there.

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

Run this against production's `DIRECT_URL` before every deploy (`deploy.yml`
already does this). `npm run db:seed` refuses to run when
`NODE_ENV=production` (see `prisma/seed.ts`) since it wipes every table
before reseeding — it's a local/demo-data tool only.

## Deploying the API (Render)

1. New **Web Service**, connected to this repo, **Root Directory** = `server`.
2. Build command:
   `npm ci --include=dev && npm run build && npm prune --omit=dev`. Three
   things matter here:
   - `npm ci`, not `npm install` — installs exactly what
     `package-lock.json` pins (same as `deploy.yml`'s test job), so the
     build can't silently drift onto a newer dependency version than
     what's been tested locally.
   - `--include=dev` — required because `NODE_ENV=production` is set (for
     the app's own runtime behavior), and npm treats that as a signal to
     skip `devDependencies` during install — which is exactly where
     `typescript` lives. Without this flag, the build step has no local
     `tsc` to run and falls through to whatever TypeScript happens to be
     on the platform's build image instead, which won't match what's
     actually been tested.
   - `npm prune --omit=dev` at the end removes everything installed only
     for the build (`typescript`, `vitest`, `vite`, etc.) once `dist/` is
     compiled — the running app (`node dist/index.js`) never imports any
     of them, so there's no reason for them to sit in the production
     container at all. This is also what makes `npm audit`'s dev-tooling
     findings (vite/vitest CVEs and similar) moot in production: those
     packages simply aren't there anymore once this runs.
3. Start command: `npm start` (`node dist/index.js`).
4. Set every variable from `server/.env.example` in the service's
   **Environment** tab, with `NODE_ENV=production` and `ALLOWED_ORIGINS`
   set to the real Vercel domain(s) that should be allowed to call this API.
5. Under **Settings → Deploy Hook**, copy the generated URL — that's
   `RENDER_DEPLOY_HOOK_URL` in the GitHub Environment secrets `deploy.yml`
   reads. Then turn **Auto-Deploy** off for this service, since `deploy.yml`
   triggers deploys explicitly (after migrations run, not before).

## Deploying the client (Vercel)

1. Point the project at `client/` as the root directory (framework preset:
   Vite).
2. Set `VITE_API_URL` to the deployed API's URL (Render gives you this
   once that service is up, e.g. `https://shift-tracker-api.onrender.com`).
3. Vercel's preview deployments get dynamic subdomains that won't match a
   fixed `ALLOWED_ORIGINS` entry — either add the specific preview domain
   you need to the API's allow-list, or point previews at a shared staging
   API instead of expecting them to hit production.
4. Leave Vercel's native Git integration (auto-deploy on push) **on** —
   unlike Render, there's no migration step to sequence against here, so
   `deploy.yml` doesn't deploy the client at all; Vercel handles it
   entirely on its own.

## Staging

Not set up — no real users/data yet, so the current setup is just local
dev plus one production stack. `.github/workflows/deploy.yml` only runs on
push to `main`. If that changes later, the pattern is: a second Supabase
project (own `DATABASE_URL`/`DIRECT_URL`/Storage bucket), a second Render
service, a second Vercel project, and a `staging` GitHub Environment
mirroring `production`'s secrets — same shape as production below, just
duplicated.

`deploy.yml` runs tests (against a Postgres service container, plus the
real Supabase Storage bucket for upload tests since those aren't mocked),
then `prisma migrate deploy`, then an explicit deploy to Render (via its
deploy hook URL) — deliberately not relying on Render's built-in
"auto-deploy on push," since that can't be sequenced after the migration
step and could deploy code against a schema it doesn't match yet. **Turn
off native auto-deploy on Render** for this repo so the two mechanisms
don't race. Vercel has no such dependency (static build, no schema to wait
on), so its native auto-deploy stays on and `deploy.yml` never touches it.

### One-time manual setup this repo's automation can't do for you

None of the following can be scripted from inside this repo — they're
account-level actions on each platform:

- [ ] Create the **production** GitHub Environment (repo Settings →
      Environments) and add its secrets/variables: `DATABASE_URL`,
      `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RENDER_DEPLOY_HOOK_URL`.
- [ ] Create the Render service for `server/`, pointed at the existing
      Supabase project's connection strings.
- [ ] Create the Vercel project for `client/`, with `VITE_API_URL` pointed
      at the Render service's URL.
- [ ] Disable auto-deploy-on-push in Render's project settings for this
      repo, since `deploy.yml` now owns that. Leave Vercel's on.
