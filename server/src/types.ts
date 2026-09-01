// SQLite/Prisma has no native enum support, so these unions are the source of
// truth for valid values stored as plain strings in SubRow.dataType and
// CellValue.statusValue.

export const DATA_TYPES = ['BADGE', 'STAFF', 'TEXT', 'LINK', 'FILE', 'STATUS'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

// Descriptive-only categorization of a Shift (Shift.sessionType). The stored
// value IS the display label — no separate code/label mapping needed.
export const SESSION_TYPES = ['Ice Session', 'Skill Session', 'Workout', 'Association'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

// AdminUser.role. The Employee model (PIN login) has no role column of its
// own — every employee session implicitly maps to COACH (see auth.ts).
export const ROLES = ['COACH', 'DIRECTOR', 'ADMIN', 'CEO'] as const;
export type Role = (typeof ROLES)[number];

// PayrollPeriod.status lifecycle.
export const PAYROLL_PERIOD_STATUSES = ['OPEN', 'REVIEWED', 'APPROVED'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

// Kinds of exception flagged on the payroll review screen. See getPayrollPeriodDetail in lib/payrollReview.ts.
export const EXCEPTION_KINDS = ['MISSING_SESSION_TYPE', 'OVERLAPPING_SHIFTS', 'CANCELLED_SESSION', 'HIGH_HOURS', 'LOW_HOURS'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

// Placeholders pending a real business rule for what counts as an unusual day.
export const HIGH_HOURS_THRESHOLD = 12;
export const LOW_HOURS_THRESHOLD = 1;
