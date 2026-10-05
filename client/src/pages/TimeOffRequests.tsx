import { useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { AdminTimeOffRequest, TimeOffStatus, useTimeOffDecisions, useTimeOffRequests } from '../hooks/useTimeOff';
import { formatTimeOffRange, TIME_OFF_STATUS_STYLES } from '../lib/timeOff';
import { formatTime12h } from '../lib/time';

const TABS: { key: TimeOffStatus; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DENIED', label: 'Denied' },
];

export default function TimeOffRequests() {
  const [status, setStatus] = useState<TimeOffStatus>('PENDING');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useTimeOffRequests(status);

  const requests = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = data?.requests ?? [];
    return term ? all.filter((r) => r.employee.name.toLowerCase().includes(term)) : all;
  }, [data?.requests, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader search={search} onSearchChange={setSearch} searchPlaceholder="Search by coach name..." showAddShiftButton={false} />
      <main className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Time-off requests</h2>

        <div className="flex items-center border border-slate-300 rounded-md overflow-hidden w-fit mb-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`px-4 py-1.5 text-sm ${status === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!isLoading && requests.length === 0 && (
          <p className="text-sm text-slate-400">
            {search.trim() ? `No requests match "${search.trim()}".` : `No ${TIME_OFF_STATUS_STYLES[status].label.toLowerCase()} requests.`}
          </p>
        )}

        <ul className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
      </main>
    </div>
  );
}

function RequestCard({ request: r }: { request: AdminTimeOffRequest }) {
  const { approve, deny } = useTimeOffDecisions();
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const style = TIME_OFF_STATUS_STYLES[r.status];
  const busy = approve.isPending || deny.isPending;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    }
  }

  const submitted = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const reviewer = r.reviewedBy ? r.reviewedBy.name || r.reviewedBy.email : null;

  return (
    <li className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">{r.employee.name}</p>
          <p className="text-sm text-slate-700">{formatTimeOffRange(r.startDate, r.endDate)}</p>
          {r.reason && <p className="text-sm text-slate-500 mt-1">“{r.reason}”</p>}
          <p className="text-xs text-slate-400 mt-1">
            Requested {submitted}
            {reviewer && ` · ${style.label.toLowerCase()} by ${reviewer}`}
          </p>
        </div>
        <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
      </div>

      {r.conflicts.length > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs font-medium text-amber-800 mb-1">Already scheduled during this time — reassign after approving:</p>
          <ul className="text-xs text-amber-800 space-y-0.5">
            {r.conflicts.map((c) => (
              <li key={c.shiftId}>
                {formatTimeOffRange(c.date, c.date)}, {formatTime12h(c.startTime)}–{formatTime12h(c.endTime)} · {c.locationName} — {c.subRowLabel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.status === 'DENIED' && r.decisionNote && <p className="mt-2 text-sm text-slate-600">Note: {r.decisionNote}</p>}

      {r.status === 'PENDING' && (
        <div className="mt-3">
          {denying ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional note to the coach"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => deny.mutateAsync({ id: r.id, note: note.trim() || undefined }))}
                  disabled={busy}
                  className="rounded-md bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm deny
                </button>
                <button onClick={() => setDenying(false)} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => run(() => approve.mutateAsync(r.id))}
                disabled={busy}
                className="rounded-md bg-green-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setDenying(true)}
                disabled={busy}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}
    </li>
  );
}
