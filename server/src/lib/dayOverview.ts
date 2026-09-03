import { prisma } from '../db';
import { computeDailyBreakdown, round2, BreakEngineResult } from './breakEngine';

export interface OverviewShift {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string | null;
  sectionId: string;
  sectionName: string;
  locationName: string;
  subRowLabel: string;
}

export interface OverviewDay {
  date: string;
  shifts: OverviewShift[];
  breakdown: BreakEngineResult;
}

export interface OverviewEmployee {
  id: string;
  name: string;
  role: string;
  days: OverviewDay[];
  totalBreakdown: {
    activeHours: number;
    paidBreakHours: number;
    unpaidDowntimeHours: number;
    billableHours: number;
  };
}

export interface RangeOverview {
  start: string;
  end: string;
  sections: { id: string; name: string; sortOrder: number }[];
  employees: OverviewEmployee[];
  totals: {
    activeHours: number;
    paidBreakHours: number;
    billableHours: number;
    reviewGapCount: number;
    employeesScheduled: number;
  };
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function sumBreakdowns(days: OverviewDay[]) {
  let activeHours = 0;
  let paidBreakHours = 0;
  let unpaidDowntimeHours = 0;
  let billableHours = 0;
  for (const d of days) {
    activeHours += d.breakdown.activeHours;
    paidBreakHours += d.breakdown.paidBreakHours;
    unpaidDowntimeHours += d.breakdown.unpaidDowntimeHours;
    billableHours += d.breakdown.billableHours;
  }
  return {
    activeHours: round2(activeHours),
    paidBreakHours: round2(paidBreakHours),
    unpaidDowntimeHours: round2(unpaidDowntimeHours),
    billableHours: round2(billableHours),
  };
}

/**
 * Workspace-wide aggregate over [start, end] (inclusive) for the Daily
 * Overview dashboard. Reuses computeDailyBreakdown per employee per day
 * (never reimplements the gap math), then sums those already-rounded
 * per-day results across the range and across employees.
 */
export async function getWorkspaceRangeOverview(
  workspaceId: string,
  start: string,
  end: string,
  campusId?: string | null
): Promise<RangeOverview> {
  const sections = await prisma.section.findMany({
    where: { workspaceId, ...(campusId ? { campusId } : {}) },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true },
  });

  // Filtering to one Campus here, same as shifts.ts's GET /, means an
  // employee who worked at more than one Campus the same day gets a
  // break/gap computation based on only the visible subset of their shifts
  // for that day — an inherent consequence of per-campus scoping, not a new
  // inconsistency introduced here.
  const assignments = await prisma.cellStaffAssignment.findMany({
    where: {
      employee: { workspaceId },
      cellValue: {
        shift: {
          workspaceId,
          date: { gte: start, lte: end },
          ...(campusId ? { subRow: { location: { section: { campusId } } } } : {}),
        },
      },
    },
    include: {
      employee: true,
      cellValue: {
        include: {
          shift: {
            include: {
              subRow: { include: { location: { include: { section: true } } } },
            },
          },
        },
      },
    },
  });

  const byEmployee = new Map<
    string,
    { employee: { id: string; name: string; role: string }; byDate: Map<string, OverviewShift[]> }
  >();

  for (const a of assignments) {
    const shift = a.cellValue.shift;
    const location = shift.subRow.location;
    const section = location.section;
    const entry: OverviewShift = {
      shiftId: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sessionType: shift.sessionType,
      sectionId: section.id,
      sectionName: section.name,
      locationName: location.name,
      subRowLabel: shift.subRow.label,
    };
    if (!byEmployee.has(a.employeeId)) {
      byEmployee.set(a.employeeId, { employee: a.employee, byDate: new Map() });
    }
    const record = byEmployee.get(a.employeeId)!;
    if (!record.byDate.has(shift.date)) record.byDate.set(shift.date, []);
    record.byDate.get(shift.date)!.push(entry);
  }

  const employees: OverviewEmployee[] = [];
  let totalActive = 0;
  let totalPaidBreak = 0;
  let totalBillable = 0;
  let reviewGapCount = 0;

  for (const { employee, byDate } of byEmployee.values()) {
    const days: OverviewDay[] = [];
    for (const date of enumerateDates(start, end)) {
      const shiftsForDate = byDate.get(date);
      if (!shiftsForDate) continue; // only include days this employee actually worked
      const sorted = [...shiftsForDate].sort((a, b) => a.startTime.localeCompare(b.startTime));
      const breakdown = computeDailyBreakdown(sorted);
      reviewGapCount += breakdown.gaps.filter((g) => g.classification === 'REVIEW_UNPAID').length;
      days.push({ date, shifts: sorted, breakdown });
    }
    if (days.length === 0) continue;

    const totalBreakdown = sumBreakdowns(days);
    totalActive += totalBreakdown.activeHours;
    totalPaidBreak += totalBreakdown.paidBreakHours;
    totalBillable += totalBreakdown.billableHours;

    employees.push({ id: employee.id, name: employee.name, role: employee.role, days, totalBreakdown });
  }

  employees.sort((a, b) => a.name.localeCompare(b.name));

  return {
    start,
    end,
    sections,
    employees,
    totals: {
      activeHours: round2(totalActive),
      paidBreakHours: round2(totalPaidBreak),
      billableHours: round2(totalBillable),
      reviewGapCount,
      employeesScheduled: employees.length,
    },
  };
}
