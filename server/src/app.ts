import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import cors from 'cors';

import { pgPool } from './db';
import authRoutes from './routes/auth';
import layoutRoutes from './routes/layout';
import employeeRoutes from './routes/employees';
import shiftRoutes from './routes/shifts';
import myShiftsRoutes from './routes/myShifts';
import analyticsRoutes from './routes/analytics';
import payrollRoutes from './routes/payroll';
import adminRoutes from './routes/admins';
import campusRoutes from './routes/campuses';

const PgSessionStore = pgSession(session);

// Comma-separated list, e.g. "https://app.example.com,https://staging.example.com".
// Falls back to the Vite dev server's origin so local dev keeps working
// unconfigured. Doesn't match Vercel's dynamic preview-deployment subdomains
// — those either need their own entry added here or should point at a
// shared staging API instead (see DEPLOYING.md).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim());

// Cross-origin (client on Vercel, API on Railway/Render) requires
// SameSite=None + Secure — but that combination is silently rejected by
// browsers over plain http://localhost, so it only makes sense once
// NODE_ENV=production (set by the hosting platform, not locally).
const isProduction = process.env.NODE_ENV === 'production';

// Factory rather than a module-level singleton so tests can spin up an
// isolated app per test file — the session store itself is no longer
// per-app (it's the shared `pgPool`, backed by one Postgres `session`
// table), but each login still gets its own random session id/cookie, so
// test files never see each other's sessions despite sharing that table.
export function createApp() {
  const app = express();

  // Render (and most hosting platforms) terminate HTTPS at a proxy/edge
  // layer and forward plain HTTP internally — without this, Express sees
  // every request as insecure, and express-session's cookie.secure=true
  // (set below when isProduction) then silently refuses to ever set the
  // session cookie at all, even on an otherwise-successful response.
  // Trusting the first hop's X-Forwarded-Proto is what tells Express the
  // original request really was HTTPS.
  if (isProduction) app.set('trust proxy', 1);

  app.use(
    cors({
      origin: ALLOWED_ORIGINS,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(
    session({
      store: new PgSessionStore({ pool: pgPool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax',
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 8,
      },
    })
  );

  // File uploads are served directly from Supabase Storage's own public
  // URLs now (see lib/storage.ts) — nothing local left to serve statically.

  app.use('/api/auth', authRoutes);
  app.use('/api/layout', layoutRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/my/shifts', myShiftsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/admin-users', adminRoutes);
  app.use('/api/campuses', campusRoutes);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}
