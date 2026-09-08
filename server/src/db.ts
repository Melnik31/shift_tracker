import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

export const prisma = new PrismaClient();

// Shared connection pool for connect-pg-simple's session store (see
// app.ts) — a second, independent client from Prisma's own internal pool,
// but talking to the same Postgres database. Kept as a module-level
// singleton for the same reason `prisma` above is: one pool per process,
// not one per createApp() call.
export const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
