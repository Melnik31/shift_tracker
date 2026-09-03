import { FormEvent, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import {
  usePayrollPeriods,
  usePayrollPeriodDetail,
  usePayrollAdjustments,
  usePayrollReopens,
  usePayrollMutations,
} from '../hooks/usePayroll';
import { colorForEmployee, initials } from '../lib/colors';
import { formatHours } from '../lib/time';
import { ExceptionKind, PayrollAdjustment, PayrollEmployeeSummary, PayrollPeriodReopen } from '../lib/types';

const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  MISSING_SESSION_TYPE: 'Missing type',
  OVERLAPPING_SHIFTS: 'Overlap',
  CANCELLED_SESSION: 'Cancelled',
  HIGH_HOURS: 'High hours',
  LOW_HOURS: 'Low hours',
};

const EXCEPTION_COLORS: Record<ExceptionKind, string> = {
  MISSING_SESSION_TYPE: 'bg-amber-100 text-amber-700',
  OVERLAPPING_SHIFTS: 'bg-red-100 text-red-700',
  CANCELLED_SESSION: 'bg-slate-200 text-slate-600',
  HIGH_HOURS: 'bg-orange-100 text-orange-700',
  LOW_HOURS: 'bg-blue-100 text-blue-700',
};

export default function PayrollReview() {
  const [search, setSearch] = useState('');
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [adjustingEmployeeId, setAdjustingEmployeeId] = useState<string | null>(null);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);

  const { data: periodsData } = usePayrollPeriods();
  const periods = periodsData?.periods ?? [];
  const activePeriodId = periodId ?? periods[0]?.id ?? null;

  const { data: detail } = usePayrollPeriodDetail(activePeriodId);
  const { data: adjustmentsData } = usePayrollAdjustments(activePeriodId);
  const { data: reopensData } = usePayrollReopens(activePeriodId);
  const { createPeriod, markReviewed, approve, createAdjustment, reopenPeriod, deletePeriod } = usePayrollMutations();

  const period = detail?.period;

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = detail?.employees ?? [];
    if (!term) return list;
    return list.filter((e) => e.employeeName.toLowerCase().includes(term));
  }, [detail?.employees, search]);

  async function handleCreatePeriod(e: FormEvent) {
    e.preventDefault();
    setPeriodError(null);
    try {
      const created = await createPeriod.mutateAsync({ start: newStart, end: newEnd });
      setPeriodId(created.id);
      setNewStart('');
      setNewEnd('');
    } catch (err: any) {
      setPeriodError(err.message ?? 'Could not create period');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees..."
        rightExtra={
          <>
            <select
              value={activePeriodId ?? ''}
              onChange={(e) => setPeriodId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {periods.length === 0 && <option value="">No periods yet</option>}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.start} – {p.end} ({p.status})
                </option>
              ))}
            </select>
            <form onSubmit={handleCreatePeriod} className="flex items-center gap-1">
              <input
                type="date"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                required
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                required
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                + New Period
              </button>
            </form>
            {period && period.status === 'OPEN' && (
              <button
                onClick={() => markReviewed.mutate(period.id)}
                className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
              >
                Mark Reviewed
              </button>
            )}
            {period && period.status === 'REVIEWED' && (
              <button
                onClick={() => approve.mutate(period.id)}
                className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
              >
                Approve &amp; Lock
              </button>
            )}
            {period && period.status === 'APPROVED' && (
              <>
                <a
                  href={`/api/payroll/periods/${period.id}/export`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Export CSV
                </a>
                <ReopenControl onReopen={(reason) => reopenPeriod.mutateAsync({ periodId: period.id, reason })} />
              </>
            )}
          </>
        }
      />

      <main className="max-w-6xl mx-auto px-6 py-6">
        {periodError && <p className="text-sm text-red-600 mb-3">{periodError}</p>}

        {!period ? (
          <p className="text-center text-sm text-slate-400 mt-10">Create a payroll period above to get started.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Payroll Review</h2>
                <p className="text-sm text-slate-500">
                  {period.start} – {period.end}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={period.status} />
                <DeletePeriodControl
                  onDelete={async () => {
                    await deletePeriod.mutateAsync(period.id);
                    setPeriodId(null);
                  }}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-5 py-2 font-medium">Employee</th>
                    <th className="px-5 py-2 font-medium text-right">Payable</th>
                    <th className="px-5 py-2 font-medium text-right">Adjustments</th>
                    <th className="px-5 py-2 font-medium text-right">Total</th>
                    <th className="px-5 py-2 font-medium">Exceptions</th>
                    <th className="px-5 py-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((e) => (
                    <EmployeeRow
                      key={e.employeeId}
                      summary={e}
                      expanded={expandedEmployeeId === e.employeeId}
                      onToggleExpand={() => setExpandedEmployeeId((cur) => (cur === e.employeeId ? null : e.employeeId))}
                      adjusting={adjustingEmployeeId === e.employeeId}
                      onToggleAdjust={() => setAdjustingEmployeeId((cur) => (cur === e.employeeId ? null : e.employeeId))}
                      onCreateAdjustment={(vars) =>
                        createAdjustment.mutateAsync({ periodId: period.id, employeeId: e.employeeId, ...vars })
                      }
                    />
                  ))}
                </tbody>
              </table>
              {filteredEmployees.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No employees with hours in this period.</p>
              )}
            </div>

            <AdjustmentsPanel adjustments={adjustmentsData?.adjustments ?? []} />

            {(reopensData?.reopens.length ?? 0) > 0 && <ReopenHistory reopens={reopensData!.reopens} />}
          </>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'APPROVED' ? 'bg-green-100 text-green-700' : status === 'REVIEWED' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full text-xs font-semibold px-3 py-1.5 uppercase tracking-wide ${cls}`}>{status}</span>;
}

function EmployeeRow({
  summary,
  expanded,
  onToggleExpand,
  adjusting,
  onToggleAdjust,
  onCreateAdjustment,
}: {
  summary: PayrollEmployeeSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  adjusting: boolean;
  onToggleAdjust: () => void;
  onCreateAdjustment: (vars: { deltaMinutes: number; reason: string }) => Promise<unknown>;
}) {
  return (
    <>
      <tr
        onClick={onToggleExpand}
        className={`border-t border-slate-50 align-top cursor-pointer hover:bg-slate-50 ${expanded ? 'bg-slate-50' : ''}`}
      >
        <td className="px-5 py-4 w-56">
          <div className="flex items-center gap-2">
            <span className={`text-slate-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ backgroundColor: colorForEmployee(summary.employeeId) }}
            >
              {initials(summary.employeeName)}
            </span>
            <span className="font-medium text-slate-800">{summary.employeeName}</span>
          </div>
        </td>
        <td className="px-5 py-4 text-right whitespace-nowrap">{formatHours(summary.payableHours)}</td>
        <td className="px-5 py-4 text-right whitespace-nowrap">
          {summary.adjustmentHours === 0 ? '—' : formatHours(summary.adjustmentHours)}
        </td>
        <td className="px-5 py-4 text-right whitespace-nowrap font-medium text-slate-900">{formatHours(summary.totalPayableHours)}</td>
        <td className="px-5 py-4">
          {summary.exceptions.length === 0 ? (
            <span className="text-xs text-slate-300">—</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-w-xs">
              {summary.exceptions.map((ex, i) => (
                <span
                  key={i}
                  title={ex.detail}
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${EXCEPTION_COLORS[ex.kind]}`}
                >
                  {EXCEPTION_LABELS[ex.kind]}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-5 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleAdjust}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
          >
            + Adjustment
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-5 py-4 border-t border-b border-slate-100">
            <EmployeeBreakdown summary={summary} />
          </td>
        </tr>
      )}
      {adjusting && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-5 py-4 border-t border-b border-slate-100" onClick={(e) => e.stopPropagation()}>
            <AdjustmentInlineForm employeeName={summary.employeeName} onCreate={onCreateAdjustment} onDone={onToggleAdjust} />
          </td>
        </tr>
      )}
    </>
  );
}

function AdjustmentInlineForm({
  employeeName,
  onCreate,
  onDone,
}: {
  employeeName: string;
  onCreate: (vars: { deltaMinutes: number; reason: string }) => Promise<unknown>;
  onDone: () => void;
}) {
  const [deltaMinutes, setDeltaMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const minutes = Number(deltaMinutes);
    if (!minutes || !reason.trim()) {
      setError('A nonzero delta and a reason are required');
      return;
    }
    try {
      await onCreate({ deltaMinutes: minutes, reason: reason.trim() });
      onDone();
    } catch (err: any) {
      setError(err.message ?? 'Could not create adjustment');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2 flex-wrap max-w-xl">
      <p className="w-full text-xs text-slate-500 mb-1">
        Adjustment for <span className="font-medium text-slate-700">{employeeName}</span>
      </p>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Delta (minutes)</label>
        <input
          autoFocus
          type="number"
          value={deltaMinutes}
          onChange={(e) => setDeltaMinutes(e.target.value)}
          placeholder="e.g. 60 or -30"
          className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs text-slate-500 mb-1">Reason</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="e.g. Missed clock-in"
        />
      </div>
      <button type="submit" className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
        Add
      </button>
      <button type="button" onClick={onDone} className="text-sm text-slate-500 px-2 py-1.5 hover:bg-slate-100 rounded-md">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

// Individual drill-down for one employee: the same figures rolled up in
// their table row, broken out — paid break time on its own, hours by
// session type, and every exception in full (not just the badge label).
function EmployeeBreakdown({ summary }: { summary: PayrollEmployeeSummary }) {
  const sessionEntries = Object.entries(summary.sessionTypeHours)
    .filter(([, hours]) => hours > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <BreakdownStat label="Payable" value={formatHours(summary.payableHours)} />
        <BreakdownStat label="Paid Break" value={formatHours(summary.paidBreakHours)} />
        <BreakdownStat label="Adjustments" value={summary.adjustmentHours === 0 ? '—' : formatHours(summary.adjustmentHours)} />
        <BreakdownStat label="Total" value={formatHours(summary.totalPayableHours)} emphasize />
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-slate-500 mb-1.5">By session type</p>
        {sessionEntries.length === 0 ? (
          <p className="text-xs text-slate-400">No shifts in this period.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sessionEntries.map(([type, hours]) => (
              <span key={type} className="inline-flex items-center gap-1.5 rounded-md bg-white border border-slate-200 px-2.5 py-1 text-xs">
                <span className="text-slate-500">{type}</span>
                <span className="font-medium text-slate-800">{formatHours(hours)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {summary.exceptions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Exceptions</p>
          <ul className="space-y-1.5">
            {summary.exceptions.map((ex, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ${EXCEPTION_COLORS[ex.kind]}`}
                >
                  {EXCEPTION_LABELS[ex.kind]}
                </span>
                <span>
                  <span className="text-slate-400">{ex.date}</span> — {ex.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BreakdownStat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={emphasize ? 'font-semibold text-slate-900' : 'text-slate-700'}>{value}</p>
    </div>
  );
}

function AdjustmentsPanel({ adjustments }: { adjustments: PayrollAdjustment[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Payroll Adjustments</h3>
      <p className="text-xs text-slate-400 mb-3">
        The sanctioned way to correct payable hours once a period is approved — never edits shift history directly.
        Use the "+ Adjustment" button on an employee's row above to add one.
      </p>

      <ul className="space-y-2">
        {adjustments.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-md px-3 py-2">
            <div>
              <span className="font-medium text-slate-800">{a.employee.name}</span>{' '}
              <span className={a.deltaMinutes > 0 ? 'text-green-600' : 'text-red-600'}>
                {a.deltaMinutes > 0 ? '+' : ''}
                {formatHours(a.deltaMinutes / 60)}
              </span>
              <p className="text-xs text-slate-400">
                {a.reason} — by {a.createdByAdmin.email}
              </p>
            </div>
          </li>
        ))}
        {adjustments.length === 0 && <p className="text-sm text-slate-400">No adjustments yet.</p>}
      </ul>
    </div>
  );
}

// For fixing test/incomplete data before a period is finalized for real —
// distinct from an adjustment, which corrects genuinely locked history
// without reopening the period. Requires a reason, same as an adjustment.
function DeletePeriodControl({ onDelete }: { onDelete: () => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:underline">
        Delete Period
      </button>
    );
  }

  async function confirm() {
    try {
      await onDelete();
    } catch (err: any) {
      setError(err.message ?? 'Could not delete period');
      setConfirming(false);
    }
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">Delete this period and its adjustment/reopen history?</span>
      <button onClick={confirm} className="text-red-600 font-medium hover:underline">
        Confirm
      </button>
      <button onClick={() => setConfirming(false)} className="text-slate-500 hover:underline">
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}

function ReopenControl({ onReopen }: { onReopen: (reason: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50"
      >
        Reopen Period
      </button>
    );
  }

  async function confirm() {
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    try {
      await onReopen(reason.trim());
      setOpen(false);
      setReason('');
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Could not reopen period');
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for reopening"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-48"
      />
      <button onClick={confirm} className="rounded-md bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-700">
        Confirm
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="text-sm text-slate-500 px-2 hover:bg-slate-100 rounded-md py-1.5"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600 ml-1">{error}</span>}
    </div>
  );
}

function ReopenHistory({ reopens }: { reopens: PayrollPeriodReopen[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-6">
      <h3 className="font-semibold text-slate-800 mb-3">Reopen History</h3>
      <ul className="space-y-2">
        {reopens.map((r) => (
          <li key={r.id} className="text-sm border border-slate-100 rounded-md px-3 py-2">
            <p className="text-slate-800">{r.reason}</p>
            <p className="text-xs text-slate-400">
              by {r.createdByAdmin.email} — {new Date(r.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
