import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CampusSelector from '../components/CampusSelector';
import NewShiftBlockModal from '../components/NewShiftBlockModal';
import { useOverview } from '../hooks/useOverview';
import { colorForEmployee, initials } from '../lib/colors';
import { toMinutes, fromMinutes, formatHours, formatTime12h } from '../lib/time';
import { OPERATIONAL_START, OPERATIONAL_END, SESSION_TYPE_COLORS } from '../lib/constants';
import { DateRange, defaultDateRange } from '../lib/dateRange';
import { OverviewEmployee, OverviewDay } from '../lib/types';

const NO_TYPE_COLOR = '#94a3b8'; // slate-400, for shifts with no sessionType set
const PAID_BREAK_COLOR = '#22c55e'; // green-500 — used for both real between-shift gaps and the ice-prep buffer below, since both are the same "paid, not on the clock" category
const ICE_SESSION_TYPE = 'Ice Session';
const ICE_PREP_MINUTES = 30; // mirrors the payroll ice-prep rule (server/src/lib/payrollReview.ts) — display only, doesn't affect the hours shown on this page

function sessionTypeColor(sessionType: string | null): string {
  return (sessionType && SESSION_TYPE_COLORS[sessionType]) || NO_TYPE_COLOR;
}

export default function DashboardView() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange());
  const [search, setSearch] = useState('');
  const [campusId, setCampusId] = useState<string | null>(null);
  const [showNewShiftBlock, setShowNewShiftBlock] = useState(false);
  const { data } = useOverview(dateRange.start, dateRange.end, campusId);

  const isMultiDay = dateRange.start !== dateRange.end;

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = data?.employees ?? [];
    if (!term) return list;
    return list.filter((e) => e.name.toLowerCase().includes(term));
  }, [data?.employees, search]);

  // Legend reflects only what's actually shown below, not every possible
  // session type — an unused type (e.g. no one's scheduled Association today)
  // has no business cluttering the key.
  const { presentSessionTypes, hasUntypedShift, hasAnyPaidBreak } = useMemo(() => {
    const types = new Set<string>();
    let untyped = false;
    let anyPaidBreak = false;
    for (const emp of filteredEmployees) {
      for (const day of emp.days) {
        for (const s of day.shifts) {
          if (s.sessionType) types.add(s.sessionType);
          else untyped = true;
        }
        if (!isMultiDay) {
          if (day.breakdown.gaps.some((g) => g.classification === 'PAID_BREAK')) anyPaidBreak = true;
          if (day.shifts[0]?.sessionType === ICE_SESSION_TYPE) anyPaidBreak = true; // ice-prep buffer renders as a paid break too
        }
      }
    }
    return { presentSessionTypes: types, hasUntypedShift: untyped, hasAnyPaidBreak: anyPaidBreak };
  }, [filteredEmployees, isMultiDay]);

  const periodLabel = formatPeriodLabel(dateRange);
  const totals = data?.totals;
  const activeEmployeeCount = data?.employees.length ?? 0;
  const singleSearchMatch = search.trim() && filteredEmployees.length === 1 ? filteredEmployees[0] : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showAddShiftButton={false}
        rightExtra={
          <>
            <CampusSelector value={campusId} onChange={setCampusId} />
            <button
              onClick={() => setShowNewShiftBlock(true)}
              className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
            >
              + New Shift Block
            </button>
          </>
        }
      />

      {showNewShiftBlock && <NewShiftBlockModal date={dateRange.start} onClose={() => setShowNewShiftBlock(false)} />}

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Daily Overview</h2>
            <p className="text-sm text-slate-500">{periodLabel}</p>
          </div>
          <span className="rounded-full bg-slate-900 text-white text-xs font-semibold tracking-wide px-3 py-1.5 uppercase">
            {activeEmployeeCount} employees scheduled
          </span>
        </div>

        {singleSearchMatch && (
          <div className="mb-6 rounded-xl border border-slate-900 bg-slate-900 text-white px-5 py-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ backgroundColor: colorForEmployee(singleSearchMatch.id) }}
              >
                {initials(singleSearchMatch.name)}
              </span>
              <div>
                <p className="font-medium">{singleSearchMatch.name}</p>
                <p className="text-xs text-slate-300">
                  {singleSearchMatch.role} · totals for {periodLabel}
                </p>
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <span>
                Session <span className="font-semibold">{formatHours(singleSearchMatch.totalBreakdown.activeHours)}</span>
              </span>
              <span>
                Paid Break{' '}
                <span className="font-semibold">
                  {singleSearchMatch.totalBreakdown.paidBreakHours === 0 ? '—' : formatHours(singleSearchMatch.totalBreakdown.paidBreakHours)}
                </span>
              </span>
              <span>
                Total Paid <span className="font-semibold">{formatHours(singleSearchMatch.totalBreakdown.billableHours)}</span>
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            icon={<StopwatchIcon />}
            iconBg="#dbeafe"
            label="Total Session Hours"
            value={formatHours(totals?.activeHours ?? 0)}
            caption={`Across ${activeEmployeeCount} active employee${activeEmployeeCount === 1 ? '' : 's'}`}
          />
          <StatCard
            icon={<CoffeeIcon />}
            iconBg="#dcfce7"
            label="Paid Break Hours"
            value={formatHours(totals?.paidBreakHours ?? 0)}
            caption="Qualifying gaps ≤ 15 minutes"
          />
          <StatCard
            icon={<TrendUpIcon />}
            iconBg="#f3e8ff"
            label="Total Paid Hours"
            value={formatHours(totals?.billableHours ?? 0)}
            caption="Session + paid breaks combined"
            pill={
              <span
                className={`rounded-full text-xs font-medium px-2 py-0.5 ${
                  (totals?.reviewGapCount ?? 0) === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {(totals?.reviewGapCount ?? 0) === 0 ? 'On track' : `${totals!.reviewGapCount} to review`}
              </span>
            }
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-3 px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="font-semibold text-slate-800">Employee Shifts</h3>
              <p className="text-xs text-slate-400">Live view · {periodLabel}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(SESSION_TYPE_COLORS)
                .filter(([type]) => presentSessionTypes.has(type))
                .map(([type, color]) => (
                  <span key={type} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {type}
                  </span>
                ))}
              {hasUntypedShift && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NO_TYPE_COLOR }} />
                  No Type
                </span>
              )}
              {hasAnyPaidBreak && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PAID_BREAK_COLOR }} />
                  Paid Break
                </span>
              )}
            </div>
          </div>

          {(data?.employees.length ?? 0) === 0 ? (
            <p className="text-center text-sm text-slate-400 py-10">No shifts scheduled for this {isMultiDay ? 'period' : 'day'}.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                      <th className="px-5 py-2 font-medium">Employee</th>
                      <th className="px-5 py-2 font-medium">Timeline / Shifts</th>
                      <th className="px-5 py-2 font-medium text-right">Session Time</th>
                      <th className="px-5 py-2 font-medium text-right">Paid Break</th>
                      <th className="px-5 py-2 font-medium text-right">Total Paid</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => (
                      <EmployeeRow key={emp.id} employee={emp} isMultiDay={isMultiDay} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 border-t border-slate-100 text-sm">
                <span className="text-slate-500">
                  Showing {filteredEmployees.length} of {data?.employees.length ?? 0} employees
                </span>
                <div className="flex gap-5 text-slate-600">
                  <span>
                    Session <span className="font-semibold text-slate-900">{formatHours(totals?.activeHours ?? 0)}</span>
                  </span>
                  <span>
                    Breaks <span className="font-semibold text-slate-900">{formatHours(totals?.paidBreakHours ?? 0)}</span>
                  </span>
                  <span>
                    Paid <span className="font-semibold text-slate-900">{formatHours(totals?.billableHours ?? 0)}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function formatPeriodLabel(range: DateRange): string {
  const start = new Date(range.start + 'T00:00:00');
  if (range.start === range.end) {
    return start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  const end = new Date(range.end + 'T00:00:00');
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  caption,
  pill,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  caption: string;
  pill?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: iconBg }}>
          {icon}
        </div>
        {pill}
      </div>
      <p className="text-xs font-medium text-slate-500 tracking-wide uppercase">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-0.5">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{caption}</p>
    </div>
  );
}

function EmployeeRow({ employee, isMultiDay }: { employee: OverviewEmployee; isMultiDay: boolean }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <tr className="border-t border-slate-50 align-top">
      <td className="px-5 py-4 w-56">
        <div className="flex items-center gap-3">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: colorForEmployee(employee.id) }}
          >
            {initials(employee.name)}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{employee.name}</p>
            <p className="text-xs text-slate-400 truncate">{employee.role}</p>
          </div>
        </div>
      </td>

      <td className="px-5 py-4 min-w-[280px]">
        {isMultiDay ? <DaySparkline days={employee.days} /> : <SingleDayTimeline day={employee.days[0]} />}
      </td>

      <td className="px-5 py-4 text-right whitespace-nowrap">{formatHours(employee.totalBreakdown.activeHours)}</td>
      <td className="px-5 py-4 text-right whitespace-nowrap">
        {employee.totalBreakdown.paidBreakHours === 0 ? '—' : formatHours(employee.totalBreakdown.paidBreakHours)}
      </td>
      <td className="px-5 py-4 text-right whitespace-nowrap font-medium text-slate-900">{formatHours(employee.totalBreakdown.billableHours)}</td>

      <td className="px-3 py-4 text-right relative">
        <button onClick={() => setMenuOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 px-2">
          ⋮
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-9 z-20 bg-white border border-slate-200 rounded-md shadow-lg text-sm w-40" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => navigate('/matrix')} className="block w-full text-left px-3 py-2 hover:bg-slate-50">
              View in Matrix
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SingleDayTimeline({ day }: { day: OverviewDay | undefined }) {
  const windowStart = toMinutes(OPERATIONAL_START);
  const windowEnd = toMinutes(OPERATIONAL_END);
  const totalWindow = windowEnd - windowStart;
  const shifts = day?.shifts ?? [];
  // day.shifts is the same start-time-sorted array computeDailyBreakdown used
  // to build day.breakdown.gaps, so afterIndex/afterIndex+1 line up directly.
  const paidBreaks = (day?.breakdown.gaps ?? []).filter((g) => g.classification === 'PAID_BREAK');

  // Display-only: mirrors the payroll ice-prep rule visually (first shift of
  // the day is an Ice Session -> 30 paid min immediately before it) without
  // touching this page's own hours, which stay independent of payroll math.
  const firstShift = shifts[0];
  const icePrep =
    firstShift?.sessionType === ICE_SESSION_TYPE
      ? { start: Math.max(windowStart, toMinutes(firstShift.startTime) - ICE_PREP_MINUTES), end: toMinutes(firstShift.startTime) }
      : null;

  return (
    <>
      <div className="relative h-2 bg-slate-100 rounded-full w-full">
        {icePrep && (
          <div
            title={`Paid break (ice prep) · ${icePrep.end - icePrep.start}m`}
            style={{
              left: `${((icePrep.start - windowStart) / totalWindow) * 100}%`,
              width: `${Math.max(((icePrep.end - icePrep.start) / totalWindow) * 100, 0.8)}%`,
            }}
            className="absolute top-0 h-full rounded-full bg-green-500"
          />
        )}
        {shifts.map((s) => {
          const left = ((toMinutes(s.startTime) - windowStart) / totalWindow) * 100;
          const width = Math.max(((toMinutes(s.endTime) - toMinutes(s.startTime)) / totalWindow) * 100, 0.8);
          return (
            <div
              key={s.shiftId}
              title={`${s.sessionType ?? s.sectionName} · ${formatTime12h(s.startTime)}–${formatTime12h(s.endTime)}`}
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: sessionTypeColor(s.sessionType) }}
              className="absolute top-0 h-full rounded-full"
            />
          );
        })}
        {paidBreaks.map((g, i) => {
          const before = shifts[g.afterIndex];
          const after = shifts[g.afterIndex + 1];
          if (!before || !after) return null;
          const gapStart = toMinutes(before.endTime);
          const gapEnd = toMinutes(after.startTime);
          const left = ((gapStart - windowStart) / totalWindow) * 100;
          const width = Math.max(((gapEnd - gapStart) / totalWindow) * 100, 0.8);
          return (
            <div
              key={`gap-${i}`}
              title={`Paid break · ${g.gapMinutes}m`}
              style={{ left: `${left}%`, width: `${width}%` }}
              className="absolute top-0 h-full rounded-full bg-green-500"
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {icePrep && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-500" />
            {formatTime12h(fromMinutes(icePrep.start))}–{formatTime12h(fromMinutes(icePrep.end))} Paid Break
          </span>
        )}
        {shifts.map((s) => (
          <span key={s.shiftId} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sessionTypeColor(s.sessionType) }} />
            {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)} {s.sessionType ?? s.sectionName}
          </span>
        ))}
      </div>
    </>
  );
}

// A single-day bar doesn't generalize to a date range, so multi-day rows show
// a compact per-day sparkline instead, with an optional expand for exact numbers.
function DaySparkline({ days }: { days: OverviewDay[] }) {
  const [expanded, setExpanded] = useState(false);
  const maxBillable = Math.max(...days.map((d) => d.breakdown.billableHours), 0.01);

  return (
    <div>
      <div className="flex items-end gap-1 h-8">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${formatShortDate(d.date)}: ${formatHours(d.breakdown.billableHours)} paid`}
            className="w-2.5 rounded-sm bg-slate-800"
            style={{ height: `${Math.max((d.breakdown.billableHours / maxBillable) * 100, 8)}%` }}
          />
        ))}
      </div>
      <button onClick={() => setExpanded((v) => !v)} className="text-[11px] text-blue-600 hover:underline mt-1">
        {expanded ? 'Hide day-by-day' : 'View day-by-day'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {days.map((d) => (
            <div key={d.date} className="flex items-center justify-between text-[11px] text-slate-500 gap-2">
              <span className="w-16 flex-shrink-0">{formatShortDate(d.date)}</span>
              <span>Session {formatHours(d.breakdown.activeHours)}</span>
              <span>Break {d.breakdown.paidBreakHours === 0 ? '—' : formatHours(d.breakdown.paidBreakHours)}</span>
              <span className="font-medium text-slate-700">Paid {formatHours(d.breakdown.billableHours)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatShortDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StopwatchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
      <path d="M18 4l1.5 1.5" />
    </svg>
  );
}

function CoffeeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 2c0 .8-.6 1-.6 1.8S8 5 8 5.8" />
      <path d="M12 2c0 .8-.6 1-.6 1.8s.6 1 .6 1.8" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 7-8" />
      <path d="M15 6h6v6" />
    </svg>
  );
}
