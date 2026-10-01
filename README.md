# ShiftTracker

A multi-tenant shift-scheduling app for coaching staff: a spreadsheet-like "Matrix" view for building and editing schedules, employee self-service shift lookup, and payroll review — scoped per campus within a workspace (tenant).

## Tech stack

- **Client** (`client/`) — React 18 + TypeScript, Vite, Tailwind CSS, TanStack Query, React Router
- **Server** (`server/`) — Express 4 + TypeScript, Prisma, a persistent Node process (not serverless) holding session state and a pooled Postgres connection
- **Database & storage** — Supabase (Postgres + Storage)
- **Hosting** — client on Vercel, server on Render, both deployed via one GitHub Actions pipeline (see [DEPLOYING.md](DEPLOYING.md))

## Repo layout

```
client/   React/Vite SPA
server/   Express API + Prisma schema/migrations
docker-compose.yml   Local Postgres for development
DEPLOYING.md         Full production deployment guide
```

## Local setup

Requires Node 24 and Docker.

```bash
docker compose up -d          # starts local Postgres
npm run install:all           # installs server + client dependencies
```

Copy the example env files and fill in any values you need (defaults work for local dev against the Docker Postgres):

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Then set up the database and start both apps:

```bash
npm run db:migrate   # applies Prisma migrations
npm run db:seed       # loads demo data (refuses to run if NODE_ENV=production)
npm run dev           # runs server + client together
```

The client runs on `http://localhost:5173`, the API on `http://localhost:4000` (Vite proxies `/api` to it in dev).

## Testing

```bash
npm test                    # server tests (Vitest + Supertest, against the local Postgres)
npm test --prefix client    # client tests (Vitest, pure-logic unit tests)
```

Both suites also run in CI on every push to `main`, before any production migration or deploy.

## Environment variables

See `server/.env.example` and `client/.env.example` for the full list, with inline comments explaining each one (session secret, CORS allow-list, Supabase connection strings, etc.). Production values are never committed — they live in Render's and Vercel's dashboards and in this repo's GitHub Environment secrets.

## Deployment

Every push to `main` runs the test suite, then applies Prisma migrations against production, then triggers a Render deploy — in that order, so the API never starts against a schema it doesn't match. Vercel deploys the client independently via its own native Git integration. See [DEPLOYING.md](DEPLOYING.md) for the full setup and rationale.

## Status

Pre-launch — functionality is actively being built out and hardened before onboarding real organizations.
