import { Router } from 'express';
import { prisma } from '../db';
import { requireAdmin } from '../middleware/auth';
import { getEmployeeDaySummaries } from '../lib/employeeShifts';
import { getWorkspaceRangeOverview } from '../lib/dayOverview';

const router = Router();
router.use(requireAdmin);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/analytics/breaks?employeeId=&start=&end() — admin view of an
// employee's break/pay breakdown. employeeId is a target selection, not an
// identity claim, so we still verify it belongs to the caller's workspace.
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

// GET /api/analytics/overview?start=YYYY-MM-DD&end=YYYY-MM-DD — workspace-wide
// Daily Overview dashboard data across [start, end]: every employee with at
// least one shift in range, their per-day and total break/pay breakdown, and
// the workspace's Sections for legend/coloring. end defaults to start (single day).
router.get('/overview', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const start = String(req.query.start ?? today());
  const end = String(req.query.end ?? start);

  const overview = await getWorkspaceRangeOverview(workspaceId, start, end);
  res.json(overview);
});

export default router;
