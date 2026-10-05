import { Router, Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { campusScopeFor, employeeCampusMatch } from '../lib/campusScope';
import { approvedOffOn, isValidDate, TIME_OFF_STATUSES, TimeOffStatus } from '../lib/timeOff';

const router = Router();
router.use(requireRole('DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'));

// A restricted DIRECTOR/SENIOR_LEAD_INSTRUCTOR only sees requests from
// employees on their own campus (plus floating, no-campus employees) — the
// same visibility rule GET /api/employees already applies.
function scopedWhere(req: Request): Prisma.TimeOffRequestWhereInput {
  const scope = campusScopeFor(req);
  return {
    workspaceId: req.session.workspaceId!,
    ...(scope.restricted ? { employee: employeeCampusMatch(scope.campusId) } : {}),
  };
}

// The coach's existing (non-cancelled) STAFF shifts inside a request's range,
// so an approver can see what they'd need to reassign.
async function conflictsFor(workspaceId: string, employeeId: string, startDate: string, endDate: string) {
  const assignments = await prisma.cellStaffAssignment.findMany({
    where: {
      employeeId,
      cellValue: { shift: { workspaceId, cancelled: false, date: { gte: startDate, lte: endDate } } },
    },
    include: { cellValue: { include: { shift: { include: { subRow: { include: { location: true } } } } } } },
  });
  return assignments
    .map((a) => {
      const s = a.cellValue.shift;
      return { shiftId: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, locationName: s.subRow.location.name, subRowLabel: s.subRow.label };
    })
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}

// GET /api/time-off?status=PENDING|APPROVED|DENIED|CANCELLED (defaults to PENDING)
router.get('/', async (req, res) => {
  const status = (TIME_OFF_STATUSES as readonly string[]).includes(String(req.query.status))
    ? (req.query.status as TimeOffStatus)
    : 'PENDING';
  const requests = await prisma.timeOffRequest.findMany({
    where: { ...scopedWhere(req), status },
    include: { employee: { select: { id: true, name: true } }, reviewedBy: { select: { id: true, name: true, email: true } } },
    orderBy: status === 'PENDING' ? { startDate: 'asc' } : { reviewedAt: 'desc' },
  });

  const withConflicts = await Promise.all(
    requests.map(async (r) => ({
      ...r,
      conflicts: r.status === 'PENDING' ? await conflictsFor(r.workspaceId, r.employeeId, r.startDate, r.endDate) : [],
    }))
  );
  res.json({ requests: withConflicts });
});

// GET /api/time-off/pending-count — drives the "Requests" nav badge.
router.get('/pending-count', async (req, res) => {
  const count = await prisma.timeOffRequest.count({ where: { ...scopedWhere(req), status: 'PENDING' } });
  res.json({ count });
});

// GET /api/time-off/off?date=YYYY-MM-DD — employee ids with approved time off
// covering that date (the staff picker grays these out).
router.get('/off', async (req, res) => {
  const date = String(req.query.date ?? '');
  if (!isValidDate(date)) return res.status(400).json({ error: 'date query param (YYYY-MM-DD) is required' });
  const rows = await prisma.timeOffRequest.findMany({
    where: { ...scopedWhere(req), ...approvedOffOn(date) },
    select: { employeeId: true },
  });
  res.json({ employeeIds: [...new Set(rows.map((r) => r.employeeId))] });
});

async function decide(req: Request, status: 'APPROVED' | 'DENIED', decisionNote: string | null) {
  const existing = await prisma.timeOffRequest.findFirst({ where: { ...scopedWhere(req), id: req.params.id } });
  if (!existing) return { code: 404 as const, body: { error: 'Request not found' } };
  if (existing.status !== 'PENDING') return { code: 409 as const, body: { error: 'This request has already been decided' } };
  const updated = await prisma.timeOffRequest.update({
    where: { id: existing.id },
    data: { status, decisionNote, reviewedById: req.session.actorId!, reviewedAt: new Date() },
  });
  return { code: 200 as const, body: updated };
}

router.post('/:id/approve', async (req, res) => {
  const result = await decide(req, 'APPROVED', null);
  res.status(result.code).json(result.body);
});

router.post('/:id/deny', async (req, res) => {
  const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim() : null;
  const result = await decide(req, 'DENIED', note);
  res.status(result.code).json(result.body);
});

export default router;
