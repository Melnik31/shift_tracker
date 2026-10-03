import { useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import CampusSelector from '../components/CampusSelector';
import { useEmployees } from '../hooks/useEmployees';
import { useGroupHours } from '../hooks/useGroupHours';
import { formatHours } from '../lib/time';
import { DateRange, allTimeDateRange, formatPeriodLabel } from '../lib/dateRange';

const CAMPUS_BADGE_CLASS = 'inline-block rounded bg-blue-50 text-blue-800 px-2 py-0.5 text-xs font-medium';

function CampusBadges({ campuses }: { campuses: { id: string; name: string }[] }) {
  if (campuses.length === 0) return <span className={`${CAMPUS_BADGE_CLASS} bg-slate-100 text-slate-500`}>All campuses</span>;
  return (
    <>
      {campuses.map((c) => (
        <span key={c.id} className={CAMPUS_BADGE_CLASS}>
          {c.name}
        </span>
      ))}
    </>
  );
}

export default function CoachGroupHours() {
  const [search, setSearch] = useState('');
  const [campusId, setCampusId] = useState<string | null>(null);
  // Defaults to "All time" rather than "Today" — a coach's group breakdown
  // is a historical rollup, not a daily schedule view, so a narrow default
  // would silently hide everything but today's shifts.
  const [dateRange, setDateRange] = useState<DateRange>(allTimeDateRange());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState('');

  // The coach list itself is never campus-filtered (no selector shows until
  // a coach is picked) — a restricted Director/SLI still only sees their
  // own campus's roster, enforced server-side regardless.
  const { data: employeesData } = useEmployees(null);
  const { data } = useGroupHours(selectedEmployeeId, dateRange.start, dateRange.end, campusId);

  // Lists every coach by default (not just after typing) so there's
  // something to click on this page's first visit — narrows as you type.
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const employees = employeesData?.employees ?? [];
    if (!term) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(term));
  }, [employeesData?.employees, search]);

  const selectedEmployee = employeesData?.employees.find((e) => e.id === selectedEmployeeId) ?? null;

  // Narrows the breakdown to one group (e.g. "T2 BLUE") so only the shifts
  // and hours the coach worked with that specific group are shown — the
  // header total is recomputed from whatever's currently visible, so
  // filtering down to one group shows exactly that group's hours as the total.
  const visibleGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    const groups = data?.groups ?? [];
    if (!term) return groups;
    return groups.filter((g) => g.group.toLowerCase().includes(term));
  }, [data?.groups, groupSearch]);
  // "Ungrouped" hours stay listed in the table but aren't counted toward the total.
  const visibleTotalHours = useMemo(
    () => visibleGroups.reduce((sum, g) => (g.group === 'Ungrouped' ? sum : sum + g.hours), 0),
    [visibleGroups]
  );

  function backToList() {
    setSelectedEmployeeId(null);
    setSearch('');
    setGroupSearch('');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setSelectedEmployeeId(null);
          setGroupSearch('');
        }}
        searchPlaceholder="Search coach by name..."
        showAddShiftButton={false}
        // Date range and campus only matter once a specific coach's hours
        // are being viewed — the coach list itself doesn't need them.
        dateRange={selectedEmployee ? dateRange : undefined}
        onDateRangeChange={selectedEmployee ? setDateRange : undefined}
        dateRangeShowAllTime
        filterExtra={selectedEmployee ? <CampusSelector value={campusId} onChange={setCampusId} /> : undefined}
      />
      <main className="max-w-4xl mx-auto px-6 py-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Coach Group Hours</h2>

        {!selectedEmployee && matches.length > 0 && (
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-6">
            {matches.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => {
                    setSelectedEmployeeId(e.id);
                    setSearch(e.name);
                    setGroupSearch('');
                  }}
                  className="w-full flex items-center justify-between gap-3 text-left px-4 py-2 text-sm hover:bg-slate-50"
                >
                  <span>{e.name}</span>
                  <span className="flex flex-wrap justify-end gap-1">
                    <CampusBadges campuses={e.campuses} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!selectedEmployee && !matches.length && (
          <p className="text-sm text-slate-400">{search.trim() ? `No coaches match "${search.trim()}".` : 'No coaches yet.'}</p>
        )}

        {selectedEmployee && data && (
          <>
            <button onClick={backToList} className="text-sm text-slate-500 hover:text-slate-800 mb-3">
              ← All coaches
            </button>

            <div className="rounded-xl border border-slate-900 bg-slate-900 text-white px-5 py-4 mb-6 flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedEmployee.name}</p>
                <p className="text-xs text-slate-300">{formatPeriodLabel(dateRange)}</p>
              </div>
              <span className="text-lg font-semibold">{formatHours(visibleTotalHours)} {groupSearch.trim() ? 'matching' : 'total'}</span>
            </div>

            <input
              type="text"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Search group..."
              className="w-full mb-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />

            <table className="w-full text-sm bg-white rounded-xl border border-slate-200">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-2 font-medium">Group</th>
                  <th className="px-5 py-2 font-medium text-right">Shifts</th>
                  <th className="px-5 py-2 font-medium text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((g) => (
                  <tr key={g.group} className={g.group === 'Ungrouped' ? 'text-slate-400' : ''}>
                    <td className="px-5 py-2">
                      <span className="inline-flex items-center gap-2">
                        {g.color && <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: g.color }} />}
                        {g.group}
                        {g.group === 'Ungrouped' && <span className="text-xs text-slate-400">(not in total)</span>}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right">{g.shiftCount}</td>
                    <td className="px-5 py-2 text-right">{formatHours(g.hours)}</td>
                  </tr>
                ))}
                {visibleGroups.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-4 text-center text-slate-400">
                      {groupSearch.trim() ? `No group matches "${groupSearch.trim()}".` : 'No shifts in this date range.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </main>
    </div>
  );
}
