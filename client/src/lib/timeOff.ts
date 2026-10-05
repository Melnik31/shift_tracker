import type { TimeOffStatus } from '../hooks/useTimeOff';

export const TIME_OFF_STATUS_STYLES: Record<TimeOffStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  DENIED: { label: 'Denied', className: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500' },
};

function fmt(date: string, withYear: boolean) {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "Wed, Jun 10" for one day, "Wed, Jun 10 – Fri, Jun 12" (3 days) for a range. */
export function formatTimeOffRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return fmt(startDate, false);
  const days = Math.round((new Date(endDate + 'T00:00:00').getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86_400_000) + 1;
  return `${fmt(startDate, false)} – ${fmt(endDate, false)} (${days} days)`;
}
