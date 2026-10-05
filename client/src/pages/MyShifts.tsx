import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { EmployeeDayShift, EmployeeDaySummary, EventSubRowInfo } from '../lib/types';
import { formatTime12h } from '../lib/time';
import { STATUS_COLORS, SESSION_TYPE_COLORS } from '../lib/constants';
import { useMyTimeOff, useMyTimeOffMutations } from '../hooks/useTimeOff';
import { formatTimeOffRange, TIME_OFF_STATUS_STYLES } from '../lib/timeOff';
import RequestTimeOffModal from '../components/RequestTimeOffModal';

type Range = 'day' | 'week' | 'upcoming';
type Tab = Range | 'timeoff';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function MyShifts() {
  const { data: me, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('day');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [date] = useState(todayStr());
  const range: Range = tab === 'timeoff' ? 'day' : tab;

  const { data } = useQuery<{ days: EmployeeDaySummary[] }>({
    queryKey: ['my-shifts', range, date],
    queryFn: () => api.get(`/my/shifts?range=${range}&date=${date}`),
    enabled: tab !== 'timeoff',
  });

  const days = data?.days ?? [];
  const hideEmptyDays = range !== 'day';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-slate-800">{me?.employee?.name}</h1>
          <p className="text-xs text-slate-400">{me?.workspace.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRequestModal(true)}
            className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
          >
            Request time off
          </button>
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="text-sm text-slate-500 hover:underline"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="px-4 py-3 flex gap-2 sticky top-[57px] bg-slate-50 z-10">
        <button
          onClick={() => setTab('day')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${tab === 'day' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          Today
        </button>
        <button
          onClick={() => setTab('week')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${tab === 'week' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          This Week
        </button>
        <button
          onClick={() => setTab('upcoming')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${tab === 'upcoming' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setTab('timeoff')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${tab === 'timeoff' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          Time off
        </button>
      </div>

      {tab === 'timeoff' ? (
        <main className="px-4 pb-10 max-w-lg mx-auto">
          <MyTimeOffList onRequest={() => setShowRequestModal(true)} />
        </main>
      ) : (
      <main className="px-4 pb-10 max-w-lg mx-auto">
        {days.filter((d) => !hideEmptyDays || d.shifts.length > 0).length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-10">No shifts scheduled.</p>
        )}
        {days.map((day) => {
          if (hideEmptyDays && day.shifts.length === 0) return null;
          return <DayCard key={day.date} day={day} showBreakdown={range !== 'upcoming'} />;
        })}
      </main>
      )}

      {showRequestModal && <RequestTimeOffModal onClose={() => setShowRequestModal(false)} onCreated={() => setTab('timeoff')} />}
    </div>
  );
}

function MyTimeOffList({ onRequest }: { onRequest: () => void }) {
  const { data, isLoading } = useMyTimeOff();
  const { cancel } = useMyTimeOffMutations();
  const requests = data?.requests ?? [];

  if (isLoading) return null;
  if (requests.length === 0) {
    return (
      <div className="text-center mt-10">
        <p className="text-sm text-slate-400 mb-3">You haven't requested any time off.</p>
        <button onClick={onRequest} className="text-sm font-medium text-blue-700 hover:text-blue-900">
          Request time off
        </button>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => {
        const style = TIME_OFF_STATUS_STYLES[r.status];
        return (
          <li key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{formatTimeOffRange(r.startDate, r.endDate)}</p>
                {r.reason && <p className="text-xs text-slate-500 mt-0.5">{r.reason}</p>}
              </div>
              <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ${style.className}`}>{style.label}</span>
            </div>
            {r.status === 'DENIED' && r.decisionNote && (
              <p className="mt-2 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                <span className="font-medium">Note:</span> {r.decisionNote}
              </p>
            )}
            {r.status === 'PENDING' && (
              <button
                onClick={() => cancel.mutate(r.id)}
                disabled={cancel.isPending}
                className="mt-2 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50"
              >
                Cancel request
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayCard({ day, showBreakdown }: { day: EmployeeDaySummary; showBreakdown: boolean }) {
  const weekday = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="font-medium text-slate-800">{weekday}</h2>
      </div>

      {day.shifts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-400">No shifts.</p>
      ) : (
        <ol className="px-4 py-3 space-y-4 relative">
          {day.shifts.map((s, i) => (
            <li key={s.shiftId} className="flex gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                {i < day.shifts.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="pb-2 min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                  {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}
                  {s.sessionType && (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: SESSION_TYPE_COLORS[s.sessionType] ?? '#64748b' }}
                    >
                      {s.sessionType}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {s.sectionName} / {s.locationName} — {s.subRowLabel}
                </p>
                <ShiftEventDetails shift={s} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {showBreakdown && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-y-1 text-sm">
          <Stat label="Active" value={day.breakdown.activeHours} />
          <Stat label="Paid Break" value={day.breakdown.paidBreakHours} />
          <Stat label="Unpaid Downtime" value={day.breakdown.unpaidDowntimeHours} />
          <Stat label="Billable Total" value={day.breakdown.billableHours} emphasize />
        </div>
      )}
    </div>
  );
}

// Everything under the time: who else is on this same shift, plus every
// other row happening at this location while it's running (badges, notes,
// links, status, other staffed roles) — the "full information" for the
// event, not just the one row the employee is personally listed on.
function ShiftEventDetails({ shift }: { shift: EmployeeDayShift }) {
  if (shift.coworkers.length === 0 && shift.event.length === 0) return null;

  return (
    <div className="mt-2 rounded-md bg-slate-50 border border-slate-100 px-3 py-2 space-y-1.5">
      {shift.coworkers.length > 0 && (
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">With:</span> {shift.coworkers.map((c) => c.name).join(', ')}
        </p>
      )}
      {shift.event.map((e) => (
        <EventRow key={e.subRowId} info={e} />
      ))}
    </div>
  );
}

function EventRow({ info }: { info: EventSubRowInfo }) {
  switch (info.dataType) {
    case 'STATUS':
      return info.statusValue ? (
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <span className="text-slate-400">{info.subRowLabel}:</span>
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: STATUS_COLORS[info.statusValue] ?? '#64748b' }}
          >
            {info.statusValue.replace('_', ' ')}
          </span>
        </p>
      ) : null;

    case 'BADGE':
      return info.badgeLabel ? (
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <span className="text-slate-400">{info.subRowLabel}:</span>
          <span
            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: info.badgeColor || '#64748b' }}
          >
            {info.badgeLabel}
          </span>
        </p>
      ) : null;

    case 'TEXT':
      return info.textValue ? (
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">{info.subRowLabel}:</span> {info.textValue}
        </p>
      ) : null;

    case 'LINK':
      return info.linkUrl ? (
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">{info.subRowLabel}:</span>{' '}
          <a href={info.linkUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            🔗 {info.textValue || 'Link'}
          </a>
        </p>
      ) : null;

    case 'STAFF':
      return info.staff.length > 0 ? (
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">{info.subRowLabel}:</span> {info.staff.map((s) => s.name).join(', ')}
        </p>
      ) : null;

    case 'FILE':
      return info.files.length > 0 ? (
        <p className="text-xs text-slate-600 space-x-2">
          <span className="text-slate-400">{info.subRowLabel}:</span>
          {info.files.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              📎 {f.filename}
            </a>
          ))}
        </p>
      ) : null;

    default:
      return null;
  }
}

function Stat({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={emphasize ? 'font-semibold text-slate-900' : 'text-slate-700'}>{value}h</p>
    </div>
  );
}
