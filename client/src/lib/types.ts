export const DATA_TYPES = ['BADGE', 'STAFF', 'TEXT', 'LINK', 'FILE', 'STATUS'] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const STATUS_VALUES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

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
  name: string;
  sortOrder: number;
  locations: Location[];
}

export interface Employee {
  id: string;
  name: string;
  role: string;
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
  cellValues: CellValue[];
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
