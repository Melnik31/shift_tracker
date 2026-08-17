import { describe, it, expect } from 'vitest';
import { computeDailyBreakdown, classifyGap } from './breakEngine';

describe('computeDailyBreakdown', () => {
  it('handles a single shift with no gaps', () => {
    const result = computeDailyBreakdown([{ startTime: '09:00', endTime: '17:00' }]);
    expect(result.activeHours).toBe(8);
    expect(result.paidBreakHours).toBe(0);
    expect(result.unpaidDowntimeHours).toBe(0);
    expect(result.billableHours).toBe(8);
    expect(result.gaps).toHaveLength(0);
  });

  it('treats a short gap (<=15 min) as paid break time', () => {
    // 09:00-12:00 (3h), 12:10-16:00 (3h50m) -> 10 min gap, paid
    const result = computeDailyBreakdown([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '12:10', endTime: '16:00' },
    ]);
    expect(result.gaps[0].classification).toBe('PAID_BREAK');
    expect(result.activeHours).toBeCloseTo(6.83, 2);
    expect(result.paidBreakHours).toBeCloseTo(0.17, 2);
    expect(result.unpaidDowntimeHours).toBe(0);
    expect(result.billableHours).toBe(7); // active + paid break, gap absorbed
  });

  it('treats a long gap (>30 min) as unpaid downtime', () => {
    // 09:00-12:00, 13:00-17:00 -> 60 min gap, unpaid
    const result = computeDailyBreakdown([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ]);
    expect(result.gaps[0].classification).toBe('UNPAID_DOWNTIME');
    expect(result.activeHours).toBe(7); // 3h + 4h
    expect(result.paidBreakHours).toBe(0);
    expect(result.unpaidDowntimeHours).toBe(1);
    expect(result.billableHours).toBe(7);
  });

  it('classifies the ambiguous 15-30 min band as REVIEW_UNPAID (documented assumption)', () => {
    // 09:00-12:00, 12:20-16:00 -> 20 min gap, ambiguous band
    const result = computeDailyBreakdown([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '12:20', endTime: '16:00' },
    ]);
    expect(result.gaps[0].classification).toBe('REVIEW_UNPAID');
    // REVIEW_UNPAID counts as unpaid downtime, not billable
    expect(result.unpaidDowntimeHours).toBeCloseTo(20 / 60, 2);
    expect(result.paidBreakHours).toBe(0);
  });

  it('sorts out-of-order shifts before computing gaps', () => {
    const result = computeDailyBreakdown([
      { startTime: '13:00', endTime: '17:00' },
      { startTime: '09:00', endTime: '12:00' },
    ]);
    expect(result.gaps[0].gapMinutes).toBe(60);
    expect(result.gaps[0].classification).toBe('UNPAID_DOWNTIME');
  });

  it('returns all zeros for an empty shift list', () => {
    const result = computeDailyBreakdown([]);
    expect(result).toEqual({
      activeHours: 0,
      paidBreakHours: 0,
      unpaidDowntimeHours: 0,
      billableHours: 0,
      gaps: [],
    });
  });
});

describe('classifyGap boundaries', () => {
  it('classifies exactly 15 min as PAID_BREAK', () => {
    expect(classifyGap(15)).toBe('PAID_BREAK');
  });
  it('classifies exactly 30 min as REVIEW_UNPAID', () => {
    expect(classifyGap(30)).toBe('REVIEW_UNPAID');
  });
  it('classifies 31 min as UNPAID_DOWNTIME', () => {
    expect(classifyGap(31)).toBe('UNPAID_DOWNTIME');
  });
});
