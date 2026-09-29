import { describe, it, expect } from 'vitest';
import { computeLanes, timeRangesOverlap, LaneShift } from './lanes';
import { toMinutes } from './time';

const WINDOW_START = toMinutes('16:00');
const DEFAULT_OPTS = { pxPerMin: 1, windowStartMin: WINDOW_START, minWidthPx: 32 };

function shift(id: string, groupKey: string, startTime: string, endTime: string): LaneShift {
  return { id, groupKey, startTime, endTime };
}

describe('computeLanes', () => {
  it('gives two overlapping practices separate lanes (mockup scenario: 5:00-6:15 and 5:30-6:30)', () => {
    const shifts = [shift('s1', 'A', '17:00', '18:15'), shift('s2', 'B', '17:30', '18:30')];
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(lanes.get('A')).toBe(0);
    expect(lanes.get('B')).toBe(1);
    expect(laneCount).toBe(2);
  });

  it('gives three mutually-overlapping practices three separate lanes', () => {
    const shifts = [shift('s1', 'A', '17:00', '18:15'), shift('s2', 'B', '17:30', '18:30'), shift('s3', 'C', '17:45', '18:10')];
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(new Set(shifts.map((s) => lanes.get(s.groupKey))).size).toBe(3);
    expect(laneCount).toBe(3);
  });

  it('reuses a lane once its occupant has ended, rather than always opening a new one', () => {
    // A (0-lane) ends well before D starts; B/C occupy their own lanes the
    // whole time, so D reusing A's lane (not opening a 4th) is the only
    // correct minimal-lane-count answer.
    const shifts = [
      shift('s1', 'A', '17:00', '18:15'),
      shift('s2', 'B', '17:30', '18:30'),
      shift('s3', 'C', '17:45', '18:10'),
      shift('s4', 'D', '18:30', '19:00'),
    ];
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(lanes.get('A')).toBe(0);
    expect(lanes.get('D')).toBe(0);
    expect(laneCount).toBe(3);
  });

  it('breaks a tie on identical start times by end time, then by groupKey, deterministically', () => {
    const shorter = shift('s1', 'E', '17:00', '17:30');
    const longer = shift('s2', 'F', '17:00', '18:00');
    const { lanes: lanesA } = computeLanes([shorter, longer], DEFAULT_OPTS);
    const { lanes: lanesB } = computeLanes([longer, shorter], DEFAULT_OPTS); // input order reversed
    expect(lanesA.get('E')).toBe(0);
    expect(lanesA.get('F')).toBe(1);
    // Same result regardless of input array order — determinism for identical inputs.
    expect(lanesB.get('E')).toBe(0);
    expect(lanesB.get('F')).toBe(1);
  });

  it('breaks a full tie (identical start AND end) by groupKey string order, regardless of input order', () => {
    const g = shift('s1', 'G', '17:00', '17:30');
    const h = shift('s2', 'H', '17:00', '17:30');
    const { lanes: forward } = computeLanes([g, h], DEFAULT_OPTS);
    const { lanes: reversed } = computeLanes([h, g], DEFAULT_OPTS);
    expect(forward.get('G')).toBe(0);
    expect(forward.get('H')).toBe(1);
    expect(reversed.get('G')).toBe(0);
    expect(reversed.get('H')).toBe(1);
  });

  it('separates two shifts that do not overlap in time but collide once the 32px minimum width is applied', () => {
    // 17:00-17:02 (2min) and 17:05-17:20 have a real 1-minute gap, but both
    // render at least 32px wide, which is enough to visually touch.
    const shifts = [shift('s1', 'I', '17:00', '17:02'), shift('s2', 'J', '17:05', '17:20')];
    expect(timeRangesOverlap('17:00', '17:02', '17:05', '17:20')).toBe(false);
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(lanes.get('I')).not.toBe(lanes.get('J'));
    expect(laneCount).toBe(2);
  });

  it('reuses the same lane for two back-to-back shifts with zero gap between them (regression: they must not be treated as colliding)', () => {
    // e.g. "H5" 5:15-6:00 PM immediately followed by "COLL & HS" 6:00-7:15
    // PM on the same row — touching, not overlapping, must share a lane.
    const shifts = [shift('s1', 'H5', '17:15', '18:00'), shift('s2', 'COLL', '18:00', '19:15')];
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(lanes.get('H5')).toBe(0);
    expect(lanes.get('COLL')).toBe(0);
    expect(laneCount).toBe(1);
  });

  it('treats a legacy (ungrouped) shift as its own independent single-member group', () => {
    // groupKey = the shift's own id, exactly what MatrixView does for a
    // Shift with blockId === null.
    const shifts = [shift('legacy-1', 'legacy-1', '17:00', '18:00'), shift('legacy-2', 'legacy-2', '17:30', '18:30')];
    const { lanes, laneCount } = computeLanes(shifts, DEFAULT_OPTS);
    expect(lanes.get('legacy-1')).not.toBe(lanes.get('legacy-2'));
    expect(laneCount).toBe(2);
  });

  it('computes a group\'s collision bounds as the union across its members, spanning SubRows with a missing value', () => {
    // Group K has two members far apart (simulating two SubRows of the same
    // practice); a third, unrelated group L sits entirely inside K's
    // combined time span without overlapping either individual member.
    // minWidthPx is 0 here so the example isn't muddied by clamping.
    const opts = { ...DEFAULT_OPTS, minWidthPx: 0 };
    const k1 = shift('k1', 'K', '17:00', '17:20');
    const k2 = shift('k2', 'K', '18:00', '18:20');
    const l = shift('l1', 'L', '17:40', '17:50');
    expect(timeRangesOverlap(l.startTime, l.endTime, k1.startTime, k1.endTime)).toBe(false);
    expect(timeRangesOverlap(l.startTime, l.endTime, k2.startTime, k2.endTime)).toBe(false);

    const { lanes, laneCount } = computeLanes([k1, k2, l], opts);
    expect(lanes.get('K')).not.toBe(lanes.get('L')); // union bounds still catch it
    expect(laneCount).toBe(2);
  });

  it('is deterministic for identical inputs, and can legitimately re-lane the same shifts at a different zoom level', () => {
    // A 1-minute real gap between two shifts: at low pxPerMin the 32px
    // minimum width makes them visually collide (2 lanes); at high
    // pxPerMin their real rendered width is already well past 32px, so the
    // real gap is enough on its own (1 lane, reused).
    const shifts = [shift('m', 'M', '17:00', '17:05'), shift('n', 'N', '17:06', '17:20')];

    const low = computeLanes(shifts, { ...DEFAULT_OPTS, pxPerMin: 1 });
    const lowAgain = computeLanes(shifts, { ...DEFAULT_OPTS, pxPerMin: 1 });
    expect(low.laneCount).toBe(2);
    expect([...low.lanes.entries()]).toEqual([...lowAgain.lanes.entries()]); // deterministic re-run

    const high = computeLanes(shifts, { ...DEFAULT_OPTS, pxPerMin: 10 });
    expect(high.laneCount).toBe(1);
  });
});
