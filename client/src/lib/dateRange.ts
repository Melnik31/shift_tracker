export type DateRangePreset = 'today' | 'week' | 'month' | 'custom';

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

/** Computes start/end for a preset, always relative to the real "today" — not a stored anchor. */
export function rangeForPreset(preset: Exclude<DateRangePreset, 'custom'>): { start: string; end: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === 'today') return { start: toDateStr(today), end: toDateStr(today) };
  if (preset === 'week') return { start: toDateStr(startOfWeek(today)), end: toDateStr(endOfWeek(today)) };
  return { start: toDateStr(startOfMonth(today)), end: toDateStr(endOfMonth(today)) };
}

export function defaultDateRange(): DateRange {
  const { start, end } = rangeForPreset('today');
  return { preset: 'today', start, end };
}
