// Break & Gap Calculation Engine
//
// Pure function: given one employee's shifts for a single day, computes how
// the gaps between shifts should be classified and rolls up total hours.
//
// Gap classification rule (as specified):
//   gap <= 15 min             -> Paid Break Time
//   gap > 30 min              -> Unpaid Downtime
//   15 min < gap <= 30 min    -> AMBIGUOUS. The spec left this range undefined.
//     ASSUMPTION (documented here and in the final summary): we treat this
//     band as unpaid ("review" downtime) rather than paid, on the theory that
//     an employer should not owe pay by default for an unexplained mid-length
//     gap - but we tag it distinctly (REVIEW_UNPAID) so a manager can audit
//     and reclassify it manually rather than it silently vanishing into
//     ordinary unpaid downtime. This is the one deliberate interpretation of
//     an underspecified rule in the whole engine.
//
// Billable hours = active (on-shift) hours + paid break hours.
// Unpaid downtime (including the REVIEW_UNPAID band) is never billable.

export interface ShiftInterval {
  /** "HH:mm" 24-hour clock, start of the shift block */
  startTime: string;
  /** "HH:mm" 24-hour clock, end of the shift block */
  endTime: string;
}

export type GapClassification = 'PAID_BREAK' | 'UNPAID_DOWNTIME' | 'REVIEW_UNPAID';

export interface GapDetail {
  /** index into the sorted shifts array of the shift the gap follows */
  afterIndex: number;
  gapMinutes: number;
  classification: GapClassification;
}

export interface BreakEngineResult {
  activeHours: number;
  paidBreakHours: number;
  unpaidDowntimeHours: number;
  billableHours: number;
  gaps: GapDetail[];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function classifyGap(gapMinutes: number): GapClassification {
  if (gapMinutes <= 15) return 'PAID_BREAK';
  if (gapMinutes > 30) return 'UNPAID_DOWNTIME';
  return 'REVIEW_UNPAID';
}

export function computeDailyBreakdown(shifts: ShiftInterval[]): BreakEngineResult {
  if (shifts.length === 0) {
    return { activeHours: 0, paidBreakHours: 0, unpaidDowntimeHours: 0, billableHours: 0, gaps: [] };
  }

  const sorted = [...shifts].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

  let activeMinutes = 0;
  let paidBreakMinutes = 0;
  let unpaidDowntimeMinutes = 0;
  const gaps: GapDetail[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const start = toMinutes(sorted[i].startTime);
    const end = toMinutes(sorted[i].endTime);
    activeMinutes += Math.max(0, end - start);

    if (i > 0) {
      const prevEnd = toMinutes(sorted[i - 1].endTime);
      // Clamp negative gaps (overlapping/back-to-back shifts) to 0 rather
      // than letting them subtract from totals.
      const gapMinutes = Math.max(0, start - prevEnd);
      const classification = classifyGap(gapMinutes);

      if (classification === 'PAID_BREAK') paidBreakMinutes += gapMinutes;
      else unpaidDowntimeMinutes += gapMinutes; // UNPAID_DOWNTIME and REVIEW_UNPAID are both unpaid

      gaps.push({ afterIndex: i - 1, gapMinutes, classification });
    }
  }

  const activeHours = round2(activeMinutes / 60);
  const paidBreakHours = round2(paidBreakMinutes / 60);
  const unpaidDowntimeHours = round2(unpaidDowntimeMinutes / 60);
  const billableHours = round2(activeHours + paidBreakHours);

  return { activeHours, paidBreakHours, unpaidDowntimeHours, billableHours, gaps };
}
