// Must run before any other import — app.ts/db.ts read process.env at
// module-evaluation time (DATABASE_URL, SUPABASE_URL, SESSION_SECRET,
// etc.). Nothing loaded .env into the actual Node process before this;
// Prisma happened to work anyway because it reads .env internally on its
// own, independent of process.env, but plain env var reads elsewhere
// (SESSION_SECRET, PORT) were only ever getting their hardcoded fallback
// values, silently matching .env by coincidence.
import 'dotenv/config';
import { createApp } from './app';

// Every route handler in this app is an `async (req, res) => {...}` with no
// try/catch — Express 4 doesn't auto-forward a rejected promise to error-
// handling middleware the way it does a synchronous throw, so an unhandled
// rejection anywhere (a bad query, a transient DB error) becomes an
// `unhandledRejection` at the process level. Node's default there is to
// crash the entire process — which just took down the service for every
// concurrent user over a single request's Postgres error. Logging instead
// of crashing means that one request fails/hangs, but everyone else's
// session and in-flight requests survive. The right long-term fix is
// wrapping every route handler to catch+respond cleanly instead of relying
// on this as a backstop — this is deliberately just the safety net, not a
// substitute for that.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const PORT = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`ShiftTracker API listening on http://localhost:${PORT}`);
});
