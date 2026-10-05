import { Router } from 'express';
import { prisma } from '../db';
import { requireEmployee } from '../middleware/auth';
import { isValidDate } from '../lib/timeOff';

const router = Router();
router.use(requireEmployee);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/my/time-off — the signed-in employee's own requests, newest first.
// employeeId always comes from the session — never trust a client-supplied id.
router.get('/', async (req, res) => {
  const requests = await prisma.timeOffRequest.findMany({
    where: { workspaceId: req.session.workspaceId!, employeeId: req.session.actorId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ requests });
});

// POST /api/my/time-off { startDate, endDate, reason? } — full days, inclusive.
router.post('/', async (req, res) => {
  const { startDate, endDate, reason } = req.body ?? {};
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ error: 'startDate and endDate must be YYYY-MM-DD dates' });
  }
  if (startDate > endDate) return res.status(400).json({ error: 'endDate must be on or after startDate' });
  if (startDate < today()) return res.status(400).json({ error: 'Time off cannot start in the past' });

  const request = await prisma.timeOffRequest.create({
    data: {
      workspaceId: req.session.workspaceId!,
      employeeId: req.session.actorId!,
      startDate,
      endDate,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    },
  });
  res.status(201).json(request);
});

// POST /api/my/time-off/:id/cancel — withdraw one of your own PENDING requests.
router.post('/:id/cancel', async (req, res) => {
  const existing = await prisma.timeOffRequest.findFirst({
    where: { id: req.params.id, workspaceId: req.session.workspaceId!, employeeId: req.session.actorId! },
  });
  if (!existing) return res.status(404).json({ error: 'Request not found' });
  if (existing.status !== 'PENDING') return res.status(409).json({ error: 'Only a pending request can be cancelled' });

  const request = await prisma.timeOffRequest.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
  res.json(request);
});

export default router;
