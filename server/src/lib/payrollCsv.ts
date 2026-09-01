import { SESSION_TYPES } from '../types';
import { NO_SESSION_TYPE_LABEL, PayrollPeriodDetail } from './payrollReview';

function csvEscape(value: string | number): string {
  const s = String(value);
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Fixed column set (all four known session types + a catch-all) so every
// export has the same shape regardless of what happened to be used that
// period — important for a file meant to be repeatedly hand-uploaded elsewhere.
const SESSION_TYPE_COLUMNS = [...SESSION_TYPES, NO_SESSION_TYPE_LABEL];

/** Manual-upload CSV for an APPROVED payroll period: employee, period dates, total payable hours (incl. paid break time), paid break hours on their own, and hours broken down by session type. */
export function buildPayrollCsv(detail: PayrollPeriodDetail): string {
  const header = [
    'Employee Name',
    'Period Start',
    'Period End',
    'Total Payable Hours',
    'Paid Break Hours',
    ...SESSION_TYPE_COLUMNS.map((t) => `${t} Hours`),
  ];

  const lines = [header.map(csvEscape).join(',')];
  for (const emp of detail.employees) {
    const row = [
      emp.employeeName,
      detail.period.start,
      detail.period.end,
      emp.totalPayableHours,
      emp.paidBreakHours,
      ...SESSION_TYPE_COLUMNS.map((t) => emp.sessionTypeHours[t] ?? 0),
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
