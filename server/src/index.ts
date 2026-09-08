// Must run before any other import — app.ts/db.ts read process.env at
// module-evaluation time (DATABASE_URL, SUPABASE_URL, SESSION_SECRET,
// etc.). Nothing loaded .env into the actual Node process before this;
// Prisma happened to work anyway because it reads .env internally on its
// own, independent of process.env, but plain env var reads elsewhere
// (SESSION_SECRET, PORT) were only ever getting their hardcoded fallback
// values, silently matching .env by coincidence.
import 'dotenv/config';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`ShiftTracker API listening on http://localhost:${PORT}`);
});
