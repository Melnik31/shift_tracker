import { prisma } from '../db';
import { computeDailyBreakdown, BreakEngineResult } from './breakEngine';

// Everything else going on at the same location during a shift — the
// badge/notes/link/status/other-staff rows an admin builds alongside the
// STAFF row an employee is actually assigned to. A shift row on its own
// rarely carries more than a name, so this is what "full event info" means
// in practice: the sibling rows at that location whose time overlaps.
export interface EventSubRowInfo {
  subRowId: string;
  subRowLabel: string;
  dataType: string;
  startTime: string;
  endTime: string;
  badgeLabel: string | null;
  badgeColor: string | null;
  textValue: string | null;
  linkUrl: string | null;
  statusValue: string | null;
  staff: { id: string; name: string }[];
  files: { id: string; filename: string; url: string }[];
}

export interface EmployeeDayShift {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string | null;
  subRowLabel: string;
  locationName: string;
  sectionName: string;
  coworkers: { id: string; name: string }[]; // others assigned to this same row/shift
  event: EventSubRowInfo[]; // other rows at the same location overlapping this shift's time
}

export interface EmployeeDaySummary {
  date: string;
  shifts: EmployeeDayShift[];
  breakdown: BreakEngineResult;
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

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

async function getEventContext(
  locationId: string,
  date: string,
  startTime: string,
  endTime: string,
  ownShiftId: string
): Promise<EventSubRowInfo[]> {
  const shifts = await prisma.shift.findMany({
    where: { date, subRow: { locationId } },
    include: {
      subRow: true,
      cellValues: {
        include: {
          staffAssignments: { include: { employee: { select: { id: true, name: true } } } },
          fileUploads: true,
        },
      },
    },
  });

  return shifts
    .filter((s) => s.id !== ownShiftId && timeRangesOverlap(s.startTime, s.endTime, startTime, endTime))
    .map((s) => {
      const cv = s.cellValues[0];
      return {
        subRowId: s.subRowId,
        subRowLabel: s.subRow.label,
        dataType: s.subRow.dataType,
        startTime: s.startTime,
        endTime: s.endTime,
        badgeLabel: cv?.badgeLabel ?? null,
        badgeColor: cv?.badgeColor ?? null,
        textValue: cv?.textValue ?? null,
        linkUrl: cv?.linkUrl ?? null,
        statusValue: cv?.statusValue ?? null,
        staff: cv?.staffAssignments.map((a) => ({ id: a.employee.id, name: a.employee.name })) ?? [],
        files: cv?.fileUploads.map((f) => ({ id: f.id, filename: f.filename, url: f.url })) ?? [],
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Shifts an employee is assigned to (via STAFF-type cell assignments) within [start, end], grouped per day with computed break/pay breakdown. */
export async function getEmployeeDaySummaries(
  workspaceId: string,
  employeeId: string,
  start: string,
  end: string
): Promise<EmployeeDaySummary[]> {
  const assignments = await prisma.cellStaffAssignment.findMany({
    where: { employeeId },
    include: {
      cellValue: {
        include: {
          shift: {
            include: {
              subRow: { include: { location: { include: { section: true } } } },
            },
          },
          staffAssignments: { include: { employee: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const relevant = assignments.filter((a) => {
    const shift = a.cellValue.shift;
    return shift.workspaceId === workspaceId && shift.date >= start && shift.date <= end;
  });

  const entries = await Promise.all(
    relevant.map(async (a): Promise<EmployeeDayShift> => {
      const shift = a.cellValue.shift;
      const event = await getEventContext(shift.subRow.locationId, shift.date, shift.startTime, shift.endTime, shift.id);
      return {
        shiftId: shift.id,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        sessionType: shift.sessionType,
        subRowLabel: shift.subRow.label,
        locationName: shift.subRow.location.name,
        sectionName: shift.subRow.location.section.name,
        coworkers: a.cellValue.staffAssignments
          .filter((sa) => sa.employeeId !== employeeId)
          .map((sa) => ({ id: sa.employee.id, name: sa.employee.name })),
        event,
      };
    })
  );

  const byDate = new Map<string, EmployeeDayShift[]>();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date)!.push(entry);
  }

  return enumerateDates(start, end).map((date) => {
    const shifts = (byDate.get(date) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const breakdown = computeDailyBreakdown(shifts);
    return { date, shifts, breakdown };
  });
}
