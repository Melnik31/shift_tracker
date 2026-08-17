import { Router } from 'express';
import { requireEmployee } from '../middleware/auth';
import { getEmployeeDaySummaries } from '../lib/employeeShifts';

const router = Router();
router.use(requireEmployee);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function endOfWeek(dateStr: string): string {
  const d = new Date(startOfWeek(dateStr) + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

const UPCOMING_DAYS = 14; // "Upcoming" is a rolling 2-week horizon, not bounded by calendar week

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// GET /api/my/shifts?range=day|week|upcoming&date=YYYY-MM-DD
// employeeId always comes from the session — never trust a client-supplied id.
router.get('/', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const employeeId = req.session.actorId!;
  const date = String(req.query.date ?? today());
  const range = req.query.range === 'week' ? 'week' : req.query.range === 'upcoming' ? 'upcoming' : 'day';

  let start = date;
  let end = date;
  if (range === 'week') {
    start = startOfWeek(date);
    end = endOfWeek(date);
  } else if (range === 'upcoming') {
    start = date;
    end = addDays(date, UPCOMING_DAYS - 1);
  }

  const days = await getEmployeeDaySummaries(workspaceId, employeeId, start, end);
  res.json({ range, start, end, days });
});

export default router;
