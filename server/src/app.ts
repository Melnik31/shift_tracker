import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/auth';
import layoutRoutes from './routes/layout';
import employeeRoutes from './routes/employees';
import shiftRoutes from './routes/shifts';
import myShiftsRoutes from './routes/myShifts';
import analyticsRoutes from './routes/analytics';
import payrollRoutes from './routes/payroll';
import adminRoutes from './routes/admins';
import campusRoutes from './routes/campuses';

// Factory rather than a module-level singleton so tests can spin up an
// isolated app (and isolated in-memory session store) per test file.
export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 },
    })
  );

  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
