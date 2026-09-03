export const DATA_TYPES = ['BADGE', 'STAFF', 'TEXT', 'LINK', 'FILE', 'STATUS'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

// Descriptive-only categorization of a Shift, mirrors server/src/types.ts.
export const SESSION_TYPES = ['Ice Session', 'Skill Session', 'Workout', 'Association'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

// Payroll review, mirrors server/src/types.ts.
export const PAYROLL_PERIOD_STATUSES = ['OPEN', 'REVIEWED', 'APPROVED'] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

export const EXCEPTION_KINDS = ['MISSING_SESSION_TYPE', 'OVERLAPPING_SHIFTS', 'CANCELLED_SESSION', 'HIGH_HOURS', 'LOW_HOURS'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

// AdminUser.role, mirrors server/src/types.ts. COACH is excluded from
// ASSIGNABLE_ADMIN_ROLES — it's the implicit Employee/PIN-login role, never
// assigned to an AdminUser through Manage Admins.
export const ASSIGNABLE_ADMIN_ROLES = ['DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR', 'ADMIN', 'CEO'] as const;
export type AssignableAdminRole = (typeof ASSIGNABLE_ADMIN_ROLES)[number];
export const CAMPUS_SCOPED_ROLES = ['DIRECTOR', 'SENIOR_LEAD_INSTRUCTOR'] as const;

export interface SubRow {
  id: string;
  locationId: string;
  label: string;
  dataType: DataType;
  sortOrder: number;
  config: string;
}

export interface Location {
  id: string;
  sectionId: string;
  name: string;
  sortOrder: number;
  subRows: SubRow[];
}

export interface Section {
  id: string;
  workspaceId: string;
  campusId: string;
  name: string;
  sortOrder: number;
  locations: Location[];
}

export interface Campus {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  active: boolean;
  sectionCount: number;
  adminCount: number;
}

export interface AdminUserAccount {
  id: string;
  name: string | null;
  email: string;
  role: AssignableAdminRole;
  active: boolean;
  mustChangePassword: boolean;
  campus: { id: string; name: string } | null;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  campusId: string | null;
  campus: { id: string; name: string } | null;
}

export interface FileUpload {
  id: string;
  filename: string;
  url: string;
}

export interface CellValue {
  id: string;
  shiftId: string;
  subRowId: string;
  textValue?: string | null;
  badgeLabel?: string | null;
  badgeColor?: string | null;
  statusValue?: StatusValue | null;
  linkUrl?: string | null;
  staffAssignments: { id: string; employee: Employee }[];
  fileUploads: FileUpload[];
}

export interface Shift {
  id: string;
  workspaceId: string;
  subRowId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType?: string | null;
  cancelled?: boolean;
  cellValues: CellValue[];
}

export interface BulkShiftRow {
  subRowId: string;
  textValue?: string;
  badgeLabel?: string;
  badgeColor?: string;
  statusValue?: string;
  linkUrl?: string;
  staffEmployeeIds?: string[];
  hasFile?: boolean;
}

export interface BulkShiftRequest {
  date: string;
  startTime: string;
  endTime: string;
  sessionType?: string | null;
  rows: BulkShiftRow[];
}

export interface BulkShiftResponse {
  created: { subRowId: string; shiftId: string; cellValueId: string }[];
  skipped: { subRowId: string; reason: string }[];
}

export interface GapDetail {
  afterIndex: number;
  gapMinutes: number;
  classification: 'PAID_BREAK' | 'UNPAID_DOWNTIME' | 'REVIEW_UNPAID';
}

export interface BreakEngineResult {
  activeHours: number;
  paidBreakHours: number;
  unpaidDowntimeHours: number;
  billableHours: number;
  gaps: GapDetail[];
}

export interface EventSubRowInfo {
  subRowId: string;
  subRowLabel: string;
  dataType: DataType;
  startTime: string;
  endTime: string;
  badgeLabel: string | null;
  badgeColor: string | null;
  textValue: string | null;
  linkUrl: string | null;
  statusValue: StatusValue | null;
  staff: { id: string; name: string }[];
  files: { id: string; filename: string; url: string }[];
}

export interface EmployeeDayShift {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType?: string | null;
  subRowLabel: string;
  locationName: string;
  sectionName: string;
  coworkers: { id: string; name: string }[];
  event: EventSubRowInfo[];
}

export interface EmployeeDaySummary {
  date: string;
  shifts: EmployeeDayShift[];
  breakdown: BreakEngineResult;
}

export interface OverviewShift {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionType: string | null;
  sectionId: string;
  sectionName: string;
  locationName: string;
  subRowLabel: string;
}

export interface OverviewDay {
  date: string;
  shifts: OverviewShift[];
  breakdown: BreakEngineResult;
}

export interface OverviewEmployee {
  id: string;
  name: string;
  role: string;
  days: OverviewDay[];
  totalBreakdown: {
    activeHours: number;
    paidBreakHours: number;
    unpaidDowntimeHours: number;
    billableHours: number;
  };
}

export interface RangeOverview {
  start: string;
  end: string;
  sections: { id: string; name: string; sortOrder: number }[];
  employees: OverviewEmployee[];
  totals: {
    activeHours: number;
    paidBreakHours: number;
    billableHours: number;
    reviewGapCount: number;
    employeesScheduled: number;
  };
}

export interface PayrollPeriod {
  id: string;
  workspaceId: string;
  start: string;
  end: string;
  status: PayrollPeriodStatus;
  createdAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
}

export interface PayrollException {
  kind: ExceptionKind;
  date: string;
  shiftId?: string;
  detail: string;
}

export interface PayrollEmployeeSummary {
  employeeId: string;
  employeeName: string;
  payableHours: number;
  paidBreakHours: number;
  adjustmentHours: number;
  totalPayableHours: number;
  exceptions: PayrollException[];
  sessionTypeHours: Record<string, number>;
}

export interface PayrollPeriodDetail {
  period: PayrollPeriod;
  employees: PayrollEmployeeSummary[];
}

export interface PayrollAdjustment {
  id: string;
  periodId: string;
  employeeId: string;
  deltaMinutes: number;
  reason: string;
  createdAt: string;
  employee: { id: string; name: string };
  createdByAdmin: { id: string; email: string };
}

export interface PayrollPeriodReopen {
  id: string;
  periodId: string;
  reason: string;
  createdAt: string;
  createdByAdmin: { id: string; email: string };
}
