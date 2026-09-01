import { prisma } from '../db';
import { PayrollPeriod } from '@prisma/client';
import { computeDailyBreakdown, round2 } from './breakEngine';
import { ExceptionKind, HIGH_HOURS_THRESHOLD, LOW_HOURS_THRESHOLD } from '../types';

export interface PayrollException {
  kind: ExceptionKind;
  date: string;
  shiftId?: string;
  detail: string;
}

export interface PayrollEmployeeSummary {
  employeeId: string;
  employeeName: string;
  payableHours: number; // from non-cancelled shifts only
  paidBreakHours: number; // qualifying-gap portion of payableHours (see breakEngine.ts), broken out for the CSV export
  adjustmentHours: number; // sum of PayrollAdjustment.deltaMinutes for this employee+period, in hours
  totalPayableHours: number; // payableHours + adjustmentHours
  exceptions: PayrollException[];
  // Raw duration of each non-cancelled shift, summed by its sessionType — keyed
  // by the exact SESSION_TYPES value, or 'No Session Type' if unset. This is a
  // simple per-shift-duration tally, not the break-engine's billableHours (paid
  // break time between shifts isn't attributable to any one session type), so
  // these figures won't necessarily sum to payableHours. Used by the CSV export.
  sessionTypeHours: Record<string, number>;
}

export interface PayrollPeriodDetail {
  period: PayrollPeriod;
  employees: PayrollEmployeeSummary[];
}

interface ShiftRow {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string | null;
  cancelled: boolean;
}

function formatRange(s: ShiftRow): string {
  return `${s.startTime}–${s.endTime}`;
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const NO_SESSION_TYPE_LABEL = 'No Session Type';

function computeEmployeePayroll(
  shifts: ShiftRow[]
): { payableHours: number; paidBreakHours: number; exceptions: PayrollException[]; sessionTypeHours: Record<string, number> } {
  const exceptions: PayrollException[] = [];
  const active = shifts.filter((s) => !s.cancelled);

  const sessionTypeHours: Record<string, number> = {};
  for (const s of active) {
    const key = s.sessionType ?? NO_SESSION_TYPE_LABEL;
    const durationHours = (toMinutes(s.endTime) - toMinutes(s.startTime)) / 60;
    sessionTypeHours[key] = round2((sessionTypeHours[key] ?? 0) + durationHours);
  }

  for (const s of shifts) {
    if (s.cancelled) {
      exceptions.push({ kind: 'CANCELLED_SESSION', date: s.date, shiftId: s.shiftId, detail: `Cancelled shift ${formatRange(s)} excluded from payable hours` });
    }
  }
  for (const s of active) {
    if (!s.sessionType) {
      exceptions.push({ kind: 'MISSING_SESSION_TYPE', date: s.date, shiftId: s.shiftId, detail: `Shift ${formatRange(s)} has no session type set` });
    }
  }

  const byDate = new Map<string, ShiftRow[]>();
  for (const s of active) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  let payableHours = 0;
  let paidBreakHours = 0;
  for (const [date, dayShifts] of byDate) {
    const sorted = [...dayShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (timeRangesOverlap(sorted[i].startTime, sorted[i].endTime, sorted[j].startTime, sorted[j].endTime)) {
          exceptions.push({
            kind: 'OVERLAPPING_SHIFTS',
            date,
            shiftId: sorted[i].shiftId,
            detail: `${formatRange(sorted[i])} overlaps ${formatRange(sorted[j])}`,
          });
        }
      }
    }

    const breakdown = computeDailyBreakdown(dayShifts);
    payableHours += breakdown.billableHours;
    paidBreakHours += breakdown.paidBreakHours;

    if (breakdown.billableHours > HIGH_HOURS_THRESHOLD) {
      exceptions.push({ kind: 'HIGH_HOURS', date, detail: `${breakdown.billableHours}h on ${date} is above the ${HIGH_HOURS_THRESHOLD}h/day threshold` });
    } else if (breakdown.billableHours < LOW_HOURS_THRESHOLD) {
      exceptions.push({ kind: 'LOW_HOURS', date, detail: `${breakdown.billableHours}h on ${date} is below the ${LOW_HOURS_THRESHOLD}h/day threshold` });
    }
  }

  exceptions.sort((a, b) => a.date.localeCompare(b.date));
  return { payableHours: round2(payableHours), paidBreakHours: round2(paidBreakHours), exceptions, sessionTypeHours };
}

/** Full payroll review detail for one period: per-employee payable hours (shift-derived + adjustments) and flagged exceptions. */
export async function getPayrollPeriodDetail(workspaceId: string, periodId: string): Promise<PayrollPeriodDetail | null> {
  const period = await prisma.payrollPeriod.findFirst({ where: { id: periodId, workspaceId } });
  if (!period) return null;

  const assignments = await prisma.cellStaffAssignment.findMany({
    where: { employee: { workspaceId }, cellValue: { shift: { workspaceId, date: { gte: period.start, lte: period.end } } } },
    include: {
      employee: { select: { id: true, name: true } },
      cellValue: { include: { shift: true } },
    },
  });

  const shiftsByEmployee = new Map<string, ShiftRow[]>();
  const employeeNames = new Map<string, string>();
  for (const a of assignments) {
    const shift = a.cellValue.shift;
    employeeNames.set(a.employeeId, a.employee.name);
    if (!shiftsByEmployee.has(a.employeeId)) shiftsByEmployee.set(a.employeeId, []);
    shiftsByEmployee.get(a.employeeId)!.push({
      shiftId: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sessionType: shift.sessionType,
      cancelled: shift.cancelled,
    });
  }

  const adjustments = await prisma.payrollAdjustment.findMany({ where: { periodId } });
  const adjustmentMinutesByEmployee = new Map<string, number>();
  for (const adj of adjustments) {
    adjustmentMinutesByEmployee.set(adj.employeeId, (adjustmentMinutesByEmployee.get(adj.employeeId) ?? 0) + adj.deltaMinutes);
  }

  // An employee with only an adjustment and no scheduled shifts this period
  // still belongs in the review — they still have payable hours.
  const employeeIds = new Set([...shiftsByEmployee.keys(), ...adjustmentMinutesByEmployee.keys()]);
  const missingNames = [...employeeIds].filter((id) => !employeeNames.has(id));
  if (missingNames.length > 0) {
    const extra = await prisma.employee.findMany({ where: { id: { in: missingNames }, workspaceId }, select: { id: true, name: true } });
    for (const e of extra) employeeNames.set(e.id, e.name);
  }

  const employees: PayrollEmployeeSummary[] = [];
  for (const employeeId of employeeIds) {
    const { payableHours, paidBreakHours, exceptions, sessionTypeHours } = computeEmployeePayroll(shiftsByEmployee.get(employeeId) ?? []);
    const adjustmentHours = round2((adjustmentMinutesByEmployee.get(employeeId) ?? 0) / 60);
    employees.push({
      employeeId,
      employeeName: employeeNames.get(employeeId) ?? 'Unknown',
      payableHours,
      paidBreakHours,
      adjustmentHours,
      totalPayableHours: round2(payableHours + adjustmentHours),
      exceptions,
      sessionTypeHours,
    });
  }
  employees.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { period, employees };
}
