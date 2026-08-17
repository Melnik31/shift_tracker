import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { EmployeeDayShift, EmployeeDaySummary, EventSubRowInfo } from '../lib/types';
import { formatTime12h } from '../lib/time';
import { STATUS_COLORS } from '../lib/constants';

type Range = 'day' | 'week' | 'upcoming';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function MyShifts() {
  const { data: me, logout } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('day');
  const [date] = useState(todayStr());

  const { data } = useQuery<{ days: EmployeeDaySummary[] }>({
    queryKey: ['my-shifts', range, date],
    queryFn: () => api.get(`/my/shifts?range=${range}&date=${date}`),
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
        <button
          onClick={async () => {
            await logout();
            navigate('/');
          }}
          className="text-sm text-slate-500 hover:underline"
        >
          Log out
        </button>
      </header>

      <div className="px-4 py-3 flex gap-2 sticky top-[57px] bg-slate-50 z-10">
        <button
          onClick={() => setRange('day')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${range === 'day' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          Today
        </button>
        <button
          onClick={() => setRange('week')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${range === 'week' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          This Week
        </button>
        <button
          onClick={() => setRange('upcoming')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${range === 'upcoming' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
        >
          Upcoming
        </button>
      </div>

      <main className="px-4 pb-10 max-w-lg mx-auto">
        {days.filter((d) => !hideEmptyDays || d.shifts.length > 0).length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-10">No shifts scheduled.</p>
        )}
        {days.map((day) => {
          if (hideEmptyDays && day.shifts.length === 0) return null;
          return <DayCard key={day.date} day={day} showBreakdown={range !== 'upcoming'} />;
        })}
      </main>
    </div>
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
                <p className="text-sm font-medium text-slate-800">
                  {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}
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
