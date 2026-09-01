import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../middleware/auth';
import { getPayrollPeriodDetail } from '../lib/payrollReview';
import { buildPayrollCsv } from '../lib/payrollCsv';

const router = Router();
// CEO gets identical access to ADMIN on every route here, including
// approve/reopen/adjustments — not read-only.
router.use(requireRole('ADMIN', 'CEO'));

async function periodInWorkspace(periodId: string, workspaceId: string) {
  return prisma.payrollPeriod.findFirst({ where: { id: periodId, workspaceId } });
}

// GET /api/payroll/periods
router.get('/periods', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const periods = await prisma.payrollPeriod.findMany({ where: { workspaceId }, orderBy: { start: 'desc' } });
  res.json({ periods });
});

// POST /api/payroll/periods { start, end }
router.post('/periods', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const { start, end } = req.body ?? {};
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  if (start > end) return res.status(400).json({ error: 'start must be on or before end' });

  const overlapping = await prisma.payrollPeriod.findFirst({
    where: { workspaceId, start: { lte: end }, end: { gte: start } },
  });
  if (overlapping) return res.status(409).json({ error: 'Overlaps an existing payroll period' });

  const period = await prisma.payrollPeriod.create({ data: { workspaceId, start, end } });
  res.status(201).json(period);
});

// GET /api/payroll/periods/:id — full review detail (payable hours + exceptions per employee)
router.get('/periods/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const detail = await getPayrollPeriodDetail(workspaceId, req.params.id);
  if (!detail) return res.status(404).json({ error: 'Payroll period not found' });
  res.json(detail);
});

// GET /api/payroll/periods/:id/export — CSV for manual upload elsewhere (no
// BambooHR or other API integration). Only available once APPROVED, since
// the whole point of approval is that the numbers are final.
router.get('/periods/:id/export', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });
  if (period.status !== 'APPROVED') {
    return res.status(409).json({ error: 'CSV export is only available once a period is APPROVED' });
  }

  const detail = await getPayrollPeriodDetail(workspaceId, period.id);
  if (!detail) return res.status(404).json({ error: 'Payroll period not found' });

  const csv = buildPayrollCsv(detail);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-${period.start}-to-${period.end}.csv"`);
  res.status(200).send(csv);
});

// POST /api/payroll/periods/:id/review  OPEN -> REVIEWED
router.post('/periods/:id/review', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });
  if (period.status !== 'OPEN') return res.status(409).json({ error: `Cannot mark reviewed from status ${period.status}` });

  const updated = await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: 'REVIEWED', reviewedAt: new Date() } });
  res.json(updated);
});

// POST /api/payroll/periods/:id/approve  REVIEWED -> APPROVED
router.post('/periods/:id/approve', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });
  if (period.status !== 'REVIEWED') return res.status(409).json({ error: `Cannot approve from status ${period.status}` });

  const updated = await prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
  res.json(updated);
});

// DELETE /api/payroll/periods/:id — removes the period entirely, cascading
// its adjustments/reopen audit rows first. Never touches Shift/CellValue
// data (a period only references a date range, it doesn't own shifts).
router.delete('/periods/:id', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });

  await prisma.payrollAdjustment.deleteMany({ where: { periodId: period.id } });
  await prisma.payrollPeriodReopen.deleteMany({ where: { periodId: period.id } });
  await prisma.payrollPeriod.delete({ where: { id: period.id } });
  res.json({ ok: true });
});

// POST /api/payroll/periods/:id/reopen  APPROVED -> OPEN, requires a reason.
// Distinct from PayrollAdjustment: this is for correcting test/incomplete
// data before a period is finalized for real, not for adjusting genuinely
// locked payroll history — so it resets reviewedAt/approvedAt too, since the
// period must go through review and approval again from scratch.
router.post('/periods/:id/reopen', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });
  if (period.status !== 'APPROVED') return res.status(409).json({ error: `Cannot reopen from status ${period.status}` });

  const { reason } = req.body ?? {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required' });
  }

  const [updated] = await prisma.$transaction([
    prisma.payrollPeriod.update({ where: { id: period.id }, data: { status: 'OPEN', reviewedAt: null, approvedAt: null } }),
    prisma.payrollPeriodReopen.create({
      data: { workspaceId, periodId: period.id, reason: reason.trim(), createdBy: req.session.actorId! },
    }),
  ]);
  res.json(updated);
});

// GET /api/payroll/periods/:id/reopens — audit log of reopen events (actor, reason, timestamp)
router.get('/periods/:id/reopens', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });

  const reopens = await prisma.payrollPeriodReopen.findMany({
    where: { periodId: period.id },
    include: { createdByAdmin: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ reopens });
});

// GET /api/payroll/periods/:id/adjustments
router.get('/periods/:id/adjustments', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });

  const adjustments = await prisma.payrollAdjustment.findMany({
    where: { periodId: period.id },
    include: {
      employee: { select: { id: true, name: true } },
      createdByAdmin: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ adjustments });
});

// POST /api/payroll/periods/:id/adjustments { employeeId, deltaMinutes, reason }
router.post('/periods/:id/adjustments', async (req, res) => {
  const workspaceId = req.session.workspaceId!;
  const period = await periodInWorkspace(req.params.id, workspaceId);
  if (!period) return res.status(404).json({ error: 'Payroll period not found' });

  const { employeeId, deltaMinutes, reason } = req.body ?? {};
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, workspaceId } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  if (typeof deltaMinutes !== 'number' || !Number.isFinite(deltaMinutes) || deltaMinutes === 0) {
    return res.status(400).json({ error: 'deltaMinutes must be a nonzero number' });
  }
  if (!reason || typeof reason !== 'string') return res.status(400).json({ error: 'reason is required' });

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      workspaceId,
      employeeId,
      periodId: period.id,
      deltaMinutes,
      reason,
      createdBy: req.session.actorId!,
    },
    include: {
      employee: { select: { id: true, name: true } },
      createdByAdmin: { select: { id: true, email: true } },
    },
  });
  res.status(201).json(adjustment);
});

export default router;
