// The datasource was originally SQLite, which has no native Prisma enum
// support; these unions were the source of truth for valid values stored
// as plain strings in SubRow.dataType and CellValue.statusValue. Kept as
// plain strings after the Postgres migration too — see the schema.prisma
// comments on Role/dataType/statusValue.

export const DATA_TYPES = ['BADGE', 'STAFF', 'TEXT', 'LINK', 'FILE', 'STATUS'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

// Descriptive-only categorization of a Shift (Shift.sessionType). The stored
// value IS the display label — no separate code/label mapping needed.
export const SESSION_TYPES = ['Ice Session', 'Skill Session', 'Workout', 'Association'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

// Employee.employmentType — tagging/filtering only (Manage Team, Payroll
// Review tabs); has no effect on payroll calculation itself.
export const EMPLOYMENT_TYPES = ['FT', 'PT'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// AdminUser.role. The Employee model (PIN login) has no role column of its
// own — every employee session implicitly maps to COACH (see auth.ts).
// ADMIN/CEO are unrestricted (every Campus in the workspace); DIRECTOR and
// SENIOR_LEAD_INSTRUCTOR are scoped to their assigned Campus (see lib/campusScope.ts).
export const ROLES = ['COACH', 'DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'] as const;
export type Role = (typeof ROLES)[number];

// The roles assignable to an AdminUser through Manage Admins. COACH is
// excluded — it's the implicit Employee/PIN-login role, never assigned to
// an AdminUser record. See routes/admins.ts.
export const ASSIGNABLE_ADMIN_ROLES = ['DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'] as const;
export type AssignableAdminRole = (typeof ASSIGNABLE_ADMIN_ROLES)[number];

// Roles restricted to a single Campus (the flip side of campusScopeFor's
// UNRESTRICTED_ROLES) — a campusId is required when assigning one of these.
export const CAMPUS_SCOPED_ROLES = ['DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR'] as const;

// PayrollPeriod.status lifecycle.
export const PAYROLL_PERIOD_STATUSES = ['OPEN', 'REVIEWED', 'APPROVED'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

// Kinds of exception flagged on the payroll review screen. See getPayrollPeriodDetail in lib/payrollReview.ts.
export const EXCEPTION_KINDS = ['MISSING_SESSION_TYPE', 'OVERLAPPING_SHIFTS', 'CANCELLED_SESSION', 'HIGH_HOURS', 'LOW_HOURS'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

// Placeholders pending a real business rule for what counts as an unusual day.
export const HIGH_HOURS_THRESHOLD = 12;
export const LOW_HOURS_THRESHOLD = 1;

// The onboarding wizard (client/src/pages/Onboarding/Onboarding.tsx) has
// this many steps; Workspace.onboardingStep reaching this value means it's
// done. Mirrored as a client-side constant of the same name.
export const ONBOARDING_COMPLETE_STEP = 4;
