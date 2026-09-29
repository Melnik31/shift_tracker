import { toMinutes } from './time';

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface LaneShift {
  id: string;
  groupKey: string;
  startTime: string;
  endTime: string;
}

export interface LaneResult {
  lanes: Map<string, number>; // groupKey -> lane index
  laneCount: number;
}

export interface ComputeLanesOptions {
  pxPerMin: number;
  windowStartMin: number;
  minWidthPx: number;
  gapPx: number;
}

interface GroupBounds {
  groupKey: string;
  minStart: number; // minutes, for sort determinism
  maxEnd: number;
  left: number; // px, union across members
  right: number; // px, union across members
}

// Overlap lanes for one Location's timeline: every shift sharing a
// `groupKey` (Shift.blockId when set, else the shift's own id — see the
// Shift.blockId schema comment) is one "practice," and every practice gets
// exactly one lane, reused across every SubRow under the Location. A
// group's collision bounds are the UNION of its members' rendered pixel
// bounds (left/width, each already clamped to `minWidthPx` individually) —
// this is never under-conservative (non-overlapping envelopes guarantee
// non-overlapping members), and in practice never over-conservative either:
// every member of a group is always saved with the exact same
// startTime/endTime by EditShiftBlockModal's shared-field save, so a
// group's envelope always collapses to that one shared interval today. If a
// future change ever lets members' times diverge independently, this stays
// correct — just possibly one lane wider than the tightest possible packing.
export function computeLanes(shifts: LaneShift[], opts: ComputeLanesOptions): LaneResult {
  const { pxPerMin, windowStartMin, minWidthPx, gapPx } = opts;

  const groups = new Map<string, GroupBounds>();
  for (const s of shifts) {
    const startMin = toMinutes(s.startTime);
    const endMin = toMinutes(s.endTime);
    const left = (startMin - windowStartMin) * pxPerMin;
    const width = Math.max((endMin - startMin) * pxPerMin, minWidthPx);
    const right = left + width;

    const existing = groups.get(s.groupKey);
    if (!existing) {
      groups.set(s.groupKey, { groupKey: s.groupKey, minStart: startMin, maxEnd: endMin, left, right });
    } else {
      existing.minStart = Math.min(existing.minStart, startMin);
      existing.maxEnd = Math.max(existing.maxEnd, endMin);
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);
    }
  }

  const sorted = [...groups.values()].sort(
    (a, b) => a.minStart - b.minStart || a.maxEnd - b.maxEnd || a.groupKey.localeCompare(b.groupKey)
  );

  // Classic "minimum platforms" greedy interval partitioning: each lane
  // remembers the right edge (plus gap) of the last group placed in it: a
  // new group reuses the first lane whose prior occupant has already ended,
  // else opens a new lane.
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const group of sorted) {
    let laneIndex = laneEnds.findIndex((end) => end <= group.left);
    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(group.right + gapPx);
    } else {
      laneEnds[laneIndex] = group.right + gapPx;
    }
    lanes.set(group.groupKey, laneIndex);
  }

  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}
