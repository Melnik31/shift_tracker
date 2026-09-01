import { Request, Response } from 'express';
import { prisma } from '../db';

/** Does an APPROVED payroll period for this workspace cover this date? */
export async function isDateLocked(workspaceId: string, date: string): Promise<boolean> {
  const approved = await prisma.payrollPeriod.findFirst({
    where: { workspaceId, status: 'APPROVED', start: { lte: date }, end: { gte: date } },
  });
  return !!approved;
}

/**
 * Single source of truth for the payroll lock's ADMIN-role bypass: a
 * session with role 'ADMIN' may still edit a locked date directly; every
 * other role must record a PayrollAdjustment instead. Writes the 409
 * response itself so call sites stay a one-line guard:
 *   if (await rejectIfLocked(req, res, workspaceId, date)) return;
 */
export async function rejectIfLocked(req: Request, res: Response, workspaceId: string, date: string): Promise<boolean> {
  if (req.session.role === 'ADMIN') return false;
  if (!(await isDateLocked(workspaceId, date))) return false;
  res.status(409).json({ error: 'This date is in an approved payroll period. Only Admin can edit it directly — create a PayrollAdjustment instead.' });
  return true;
}
