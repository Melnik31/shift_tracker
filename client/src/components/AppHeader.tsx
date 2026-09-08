import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import AddShiftModal from './AddShiftModal';
import DateRangePicker from './DateRangePicker';
import { DateRange } from '../lib/dateRange';

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Extra filter/context controls (e.g. Campus selector, Zoom, a period picker) — rendered alongside search/date on the left of the second row. */
  filterExtra?: ReactNode;
  /** Page-specific action buttons (e.g. "+ New Shift Block", a Manage menu) — rendered on the right of the second row. */
  actionsExtra?: ReactNode;
  /** Single-date mode (default) — used by the Facility Matrix View. */
  date?: string;
  onDateChange?: (v: string) => void;
  /** Range mode — used by the Daily Overview dashboard. Takes precedence over date/onDateChange when provided. */
  dateRange?: DateRange;
  onDateRangeChange?: (r: DateRange) => void;
  /** Set false to hide the built-in "+ Add Shift" button — e.g. Matrix View, where "+ New Shift Block" is the primary creation action instead. */
  showAddShiftButton?: boolean;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

export default function AppHeader({
  search,
  onSearchChange,
  searchPlaceholder,
  date,
  onDateChange,
  dateRange,
  onDateRangeChange,
  filterExtra,
  actionsExtra,
  showAddShiftButton = true,
}: Props) {
  const { data: me, logout } = useAuth();
  const navigate = useNavigate();
  const [showAddShift, setShowAddShift] = useState(false);
  const effectiveDate = dateRange ? dateRange.start : date ?? '';

  return (
    <header className="bg-white border-b border-slate-200">
      {/* Row 1: identity — brand, primary nav, sign-out. Never competes with filters/actions below it. */}
      <div className="px-6 py-3 flex items-center gap-6 border-b border-slate-100">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">{me?.workspace.name}</h1>
          <p className="text-xs text-slate-400">code: {me?.workspace.workspaceCode}</p>
        </div>
        <nav className="flex gap-1">
          <NavLink to="/matrix" className={tabClass}>
            Matrix
          </NavLink>
          <NavLink to="/dashboard" className={tabClass}>
            Dashboard
          </NavLink>
          {me?.admin?.role === 'ADMIN' && (
            <NavLink to="/payroll" className={tabClass}>
              Payroll
            </NavLink>
          )}
        </nav>
        <button
          onClick={async () => {
            await logout();
            navigate('/');
          }}
          className="ml-auto text-sm text-slate-500 hover:text-slate-800"
        >
          Log out
        </button>
      </div>

      {/* Row 2: filters on the left, actions on the right — kept apart so the
          page's creation/management buttons never get lost among selectors. */}
      <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder={searchPlaceholder ?? 'Search employees...'}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm w-56"
        />
        {dateRange && onDateRangeChange ? (
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
        ) : (
          date !== undefined && (
            <input
              type="date"
              value={date}
              onChange={(e) => onDateChange?.(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          )
        )}
        {filterExtra}

        <div className="flex-1" />

        {showAddShiftButton && (
          <button onClick={() => setShowAddShift(true)} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700">
            + Add Shift
          </button>
        )}
        {actionsExtra}
      </div>

      {showAddShift && <AddShiftModal date={effectiveDate} onClose={() => setShowAddShift(false)} />}
    </header>
  );
}
