import { prisma } from '../db';
import { round2 } from './breakEngine';

export interface GroupHoursBreakdown {
  group: string; // e.g. "T2 BLUE", or "Ungrouped"
  color: string | null; // the badge color saved on the first sibling shift seen for this group; null for Ungrouped
  hours: number;
  shiftCount: number;
}

export interface GroupHoursResult {
  employee: { id: string; name: string };
  start: string;
  end: string;
  totalHours: number;
  groups: GroupHoursBreakdown[];
}

const UNGROUPED = 'Ungrouped';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * How many hours a coach (Employee) worked with each "group" over a date
 * range — "group" being the admin-designated BADGE sub-row value for a
 * Location (SubRow.isGroupField), e.g. "T2 BLUE". Raw scheduled duration
 * only (endTime - startTime), deliberately NOT breakEngine's gap math —
 * this is a staffing/headcount-by-group view, not a payroll one.
 *
 * A coach's own CellStaffAssignment always lives on a STAFF-type Shift, so
 * the group label always comes from a SIBLING Shift at the Location's
 * group-field SubRow, for the same practice: matched by `blockId` when
 * set, else by the same `locationId+date+startTime+endTime` fallback key
 * MatrixView.tsx's groupKeyFor/lib/lanes.ts already use client-side for
 * visual lane/color grouping. No label normalization — two Locations that
 * spell the same conceptual group differently show as separate rows; this
 * is a deliberate known limitation, not a bug (folding risks merging
 * genuinely different groups).
 */
export async function getEmployeeGroupHours(
  workspaceId: string,
  employeeId: string,
  start: string,
  end: string,
  campusId?: string | null
): Promise<GroupHoursResult> {
  const employee = await prisma.employee.findFirstOrThrow({
    where: { id: employeeId, workspaceId },
    select: { id: true, name: true },
  });

  // The coach's own non-cancelled shifts in range, each carrying its
  // Location's designated group-field SubRow id (at most one, via the
  // nested `where: { isGroupField: true }` — same single-query shape as
  // getWorkspaceRangeOverview, no per-shift follow-up query needed here).
  const assignments = await prisma.cellStaffAssignment.findMany({
    where: {
      employeeId,
      cellValue: {
        shift: {
          workspaceId,
          cancelled: false,
          date: { gte: start, lte: end },
          ...(campusId ? { subRow: { location: { section: { campusId } } } } : {}),
        },
      },
    },
    include: {
      cellValue: {
        include: {
          shift: {
            include: {
              subRow: {
                include: {
                  location: {
                    include: {
                      subRows: { where: { isGroupField: true }, select: { id: true } }, // 0 or 1 row
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Batch-fetch every candidate sibling shift (at any of the needed
  // group-field SubRows, in range) in ONE query — no N+1 regardless of how
  // many of the coach's shifts there are.
  const groupFieldSubRowIds = [
    ...new Set(assignments.map((a) => a.cellValue.shift.subRow.location.subRows[0]?.id).filter((id): id is string => !!id)),
  ];
  const siblingCandidates = groupFieldSubRowIds.length
    ? await prisma.shift.findMany({
        where: { subRowId: { in: groupFieldSubRowIds }, workspaceId, date: { gte: start, lte: end } },
        include: { cellValues: true }, // exactly one, at this shift's own subRowId (CellValue's @@unique([shiftId, subRowId]))
      })
    : [];

  const byBlockId = new Map<string, { label: string | null; color: string | null }>(); // blockId -> badge
  const byFallbackKey = new Map<string, { label: string | null; color: string | null }>(); // `${subRowId}|${date}|${start}|${end}` -> badge
  for (const s of siblingCandidates) {
    const cv = s.cellValues[0];
    const badge = { label: cv?.badgeLabel?.trim() || null, color: cv?.badgeColor ?? null };
    if (s.blockId) byBlockId.set(s.blockId, badge);
    else byFallbackKey.set(`${s.subRowId}|${s.date}|${s.startTime}|${s.endTime}`, badge);
  }

  // Resolve each of the coach's shifts to a group label (+ its badge color,
  // kept from whichever sibling shift is seen first for that group — color
  // isn't guaranteed consistent across every shift sharing a label, same
  // caveat as the label itself not being normalized) and accumulate raw
  // scheduled duration.
  const totals = new Map<string, { color: string | null; minutes: number; shiftCount: number }>();
  for (const a of assignments) {
    const shift = a.cellValue.shift;
    const groupFieldSubRowId = shift.subRow.location.subRows[0]?.id ?? null;

    let badge: { label: string | null; color: string | null } | undefined;
    if (groupFieldSubRowId) {
      badge = shift.blockId
        ? byBlockId.get(shift.blockId)
        : byFallbackKey.get(`${groupFieldSubRowId}|${shift.date}|${shift.startTime}|${shift.endTime}`);
    }
    const group = badge?.label ?? UNGROUPED;

    const minutes = toMinutes(shift.endTime) - toMinutes(shift.startTime);
    const entry = totals.get(group) ?? { color: badge?.color ?? null, minutes: 0, shiftCount: 0 };
    entry.minutes += minutes;
    entry.shiftCount += 1;
    totals.set(group, entry);
  }

  const groups: GroupHoursBreakdown[] = [...totals.entries()]
    .map(([group, { color, minutes, shiftCount }]) => ({ group, color: group === UNGROUPED ? null : color, hours: round2(minutes / 60), shiftCount }))
    .sort((a, b) => (a.group === UNGROUPED ? 1 : b.group === UNGROUPED ? -1 : b.hours - a.hours));

  const totalHours = round2(groups.reduce((sum, g) => sum + g.hours, 0));

  return { employee, start, end, totalHours, groups };
}
