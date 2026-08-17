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
  rightExtra?: ReactNode;
  /** Single-date mode (default) — used by the Facility Matrix View. */
  date?: string;
  onDateChange?: (v: string) => void;
  /** Range mode — used by the Daily Overview dashboard. Takes precedence over date/onDateChange when provided. */
  dateRange?: DateRange;
  onDateRangeChange?: (r: DateRange) => void;
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
  rightExtra,
}: Props) {
  const { data: me, logout } = useAuth();
  const navigate = useNavigate();
  const [showAddShift, setShowAddShift] = useState(false);
  const effectiveDate = dateRange ? dateRange.start : date ?? '';

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{me?.workspace.name}</h1>
          <p className="text-xs text-slate-400">code: {me?.workspace.workspaceCode}</p>
        </div>
        <nav className="flex gap-1">
          <NavLink to="/matrix" className={tabClass}>
            Matrix
          </NavLink>
          <NavLink to="/dashboard" className={tabClass}>
            Dashboard
          </NavLink>
        </nav>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange?.(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        )}
        <button onClick={() => setShowAddShift(true)} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700">
          + Add Shift
        </button>
        {rightExtra}
        <button
          onClick={async () => {
            await logout();
            navigate('/');
          }}
          className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
        >
          Log out
        </button>
      </div>

      {showAddShift && <AddShiftModal date={effectiveDate} onClose={() => setShowAddShift(false)} />}
    </header>
  );
}
