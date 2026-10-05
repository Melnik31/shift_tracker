import { Prisma } from '@prisma/client';

export const TIME_OFF_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(new Date(value + 'T00:00:00').getTime());
}

// An APPROVED request whose inclusive [startDate, endDate] range covers
// `date`. YYYY-MM-DD strings compare correctly as plain strings.
export function approvedOffOn(date: string): Prisma.TimeOffRequestWhereInput {
  return { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } };
}
