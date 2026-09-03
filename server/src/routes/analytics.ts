import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { getEmployeeDaySummaries } from '../lib/employeeShifts';
import { getWorkspaceRangeOverview } from '../lib/dayOverview';
import { campusScopeFor, NO_CAMPUS_ASSIGNED } from '../lib/campusScope';

const router = Router();
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/analytics/breaks?employeeId=&start=&end() — admin view of an
// employee's break/pay breakdown. employeeId is a target selection, not an
// identity claim, so we still verify it belongs to the caller's workspace.
// Deliberately NOT campus-scoped — this is a single named employee's own
// full history, and campus-scoping it correctly depends on deciding
// employee campus behavior first (still a follow-up phase; see /overview
// below for the one analytics route that is campus-scoped in this phase).
router.get('/breaks', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const employeeId = String(req.query.employeeId ?? '');
  const start = String(req.query.start ?? today());
  const end = String(req.query.end ?? start);

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, workspaceId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const days = await getEmployeeDaySummaries(workspaceId, employeeId, start, end);
  res.json({ employee: { id: employee.id, name: employee.name }, start, end, days });
});

// GET /api/analytics/overview?start=YYYY-MM-DD&end=YYYY-MM-DD[&campusId=] —
// Daily Overview dashboard data across [start, end]: every employee with at
// least one shift in range, their per-day and total break/pay breakdown, and
// the workspace's Sections for legend/coloring. end defaults to start (single
// day). Campus-scoped like layout.ts/shifts.ts: a restricted DIRECTOR/
// SENIOR_LEAD_INSTRUCTOR only sees their own Campus; an unrestricted ADMIN/CEO
// sees every Campus unless they narrow it with ?campusId= (the Campus selector).
router.get('/overview', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const scope = campusScopeFor(req);
  const start = String(req.query.start ?? today());
  const end = String(req.query.end ?? start);

  // A restricted Director/SLI with no campus assigned must still fail
  // closed (an empty overview), not silently fall through to "no filter"
  // (which would mean the full workspace) — same NO_CAMPUS_ASSIGNED
  // sentinel campusWhere/lib/ownership.ts use for the same situation.
  const campusId = scope.restricted ? scope.campusId ?? NO_CAMPUS_ASSIGNED : null;
  const overview = await getWorkspaceRangeOverview(workspaceId, start, end, campusId);
  res.json(overview);
});

export default router;
