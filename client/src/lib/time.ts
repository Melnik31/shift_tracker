export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = Math.floor(mins % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Single shared display formatter for all 24h "HH:mm" times in the app.
 * Internal storage/computation stays 24h/ISO everywhere — only this
 * function's output is ever shown to a user, so formatting stays consistent.
 * e.g. "09:00" -> "9:00 AM", "14:30" -> "2:30 PM", "00:00" -> "12:00 AM".
 */
export function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** e.g. 33 -> "33h", 0.5 -> "30m", 1.5 -> "1h 30m", 0 -> "0h" */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes === 0) return '0h';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
