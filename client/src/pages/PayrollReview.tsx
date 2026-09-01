import { FormEvent, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import {
  usePayrollPeriods,
  usePayrollPeriodDetail,
  usePayrollAdjustments,
  usePayrollReopens,
  usePayrollMutations,
} from '../hooks/usePayroll';
import { useEmployees } from '../hooks/useEmployees';
import { colorForEmployee, initials } from '../lib/colors';
import { formatHours } from '../lib/time';
import { Employee, ExceptionKind, PayrollAdjustment, PayrollEmployeeSummary, PayrollPeriodReopen } from '../lib/types';

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
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);

  const { data: periodsData } = usePayrollPeriods();
  const periods = periodsData?.periods ?? [];
  const activePeriodId = periodId ?? periods[0]?.id ?? null;

  const { data: detail } = usePayrollPeriodDetail(activePeriodId);
  const { data: adjustmentsData } = usePayrollAdjustments(activePeriodId);
  const { data: reopensData } = usePayrollReopens(activePeriodId);
  const { data: employeesData } = useEmployees();
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
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((e) => (
                    <EmployeeRow key={e.employeeId} summary={e} />
                  ))}
                </tbody>
              </table>
              {filteredEmployees.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No employees with hours in this period.</p>
              )}
            </div>

            <AdjustmentsPanel
              periodId={period.id}
              employees={employeesData?.employees ?? []}
              adjustments={adjustmentsData?.adjustments ?? []}
              onCreate={(vars) => createAdjustment.mutateAsync(vars)}
            />

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

function EmployeeRow({ summary }: { summary: PayrollEmployeeSummary }) {
  return (
    <tr className="border-t border-slate-50 align-top">
      <td className="px-5 py-4 w-56">
        <div className="flex items-center gap-3">
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
    </tr>
  );
}

function AdjustmentsPanel({
  periodId,
  employees,
  adjustments,
  onCreate,
}: {
  periodId: string;
  employees: Employee[];
  adjustments: PayrollAdjustment[];
  onCreate: (vars: { periodId: string; employeeId: string; deltaMinutes: number; reason: string }) => Promise<unknown>;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [deltaMinutes, setDeltaMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const minutes = Number(deltaMinutes);
    if (!employeeId || !minutes || !reason.trim()) {
      setError('Employee, a nonzero delta, and a reason are all required');
      return;
    }
    try {
      await onCreate({ periodId, employeeId, deltaMinutes: minutes, reason: reason.trim() });
      setEmployeeId('');
      setDeltaMinutes('');
      setReason('');
    } catch (err: any) {
      setError(err.message ?? 'Could not create adjustment');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-semibold text-slate-800 mb-3">Payroll Adjustments</h3>
      <p className="text-xs text-slate-400 mb-3">
        The sanctioned way to correct payable hours once a period is approved — never edits shift history directly.
      </p>

      <ul className="space-y-2 mb-4">
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

      <form onSubmit={onAdd} className="border-t border-slate-100 pt-4 flex gap-2 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Select…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Delta (minutes)</label>
          <input
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
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
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
