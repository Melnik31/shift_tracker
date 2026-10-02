export type DateRangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  start: string;
  end: string;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Sentinel bounds for the "All time" preset — wide enough to cover any
// realistic shift data without needing the server to support an open-ended
// date filter.
const ALL_TIME_START = '2000-01-01';
const ALL_TIME_END = '2100-12-31';

/** Computes start/end for a preset, always relative to the real "today" — not a stored anchor. */
export function rangeForPreset(preset: Exclude<DateRangePreset, 'custom'>): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === 'today') return { start: toDateStr(today), end: toDateStr(today) };
  if (preset === 'week') return { start: toDateStr(startOfWeek(today)), end: toDateStr(endOfWeek(today)) };
  if (preset === 'month') return { start: toDateStr(startOfMonth(today)), end: toDateStr(endOfMonth(today)) };
  return { start: ALL_TIME_START, end: ALL_TIME_END };
}

export function defaultDateRange(): DateRange {
  const { start, end } = rangeForPreset('today');
  return { preset: 'today', start, end };
}

export function allTimeDateRange(): DateRange {
  const { start, end } = rangeForPreset('all');
  return { preset: 'all', start, end };
}

/** Human-readable label for a range — a single date spelled out in full, or "Mon D – Mon D, YYYY" for a span. */
export function formatPeriodLabel(range: DateRange): string {
  if (range.preset === 'all') return 'All time';
  const start = new Date(range.start + 'T00:00:00');
  if (range.start === range.end) {
    return start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  const end = new Date(range.end + 'T00:00:00');
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}
