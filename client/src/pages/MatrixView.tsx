import { Fragment, useMemo, useState } from 'react';
import { useLayout } from '../hooks/useLayout';
import { useShifts, useShiftMutations } from '../hooks/useShifts';
import { useEmployees } from '../hooks/useEmployees';
import { toMinutes, formatTime12h } from '../lib/time';
import { OPERATIONAL_START, OPERATIONAL_END, SESSION_TYPE_COLORS } from '../lib/constants';
import { CellValue, Shift, SubRow } from '../lib/types';
import CellBlock from '../components/CellBlock';
import CellPopover from '../components/CellPopover';
import ManageLayoutModal from '../components/ManageLayoutModal';
import ManageTeamModal from '../components/ManageTeamModal';
import NewShiftBlockModal from '../components/NewShiftBlockModal';
import AppHeader from '../components/AppHeader';

const ROW_HEIGHT = 52; // single-line cell content: BADGE, LINK, FILE, STATUS
const MULTILINE_ROW_HEIGHT = 108; // multi-line cell content: STAFF (up to 3 names), TEXT (up to 3 wrapped lines)
const HEADER_ROW_HEIGHT = 40;
const SECTION_ROW_HEIGHT = 36;
const LOCATION_ROW_HEIGHT = 30;
const LABEL_WIDTH = 260;
const BASE_PX_PER_MIN = 2.2;
const GRID_BOTTOM_PADDING = 24; // keeps the last row from sitting flush against the scroll container's edge

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type FlatRow =
  | { kind: 'section'; id: string; name: string }
  | { kind: 'location'; id: string; name: string }
  | { kind: 'subrow'; id: string; label: string; dataType: SubRow['dataType']; subRow: SubRow };

export default function MatrixView() {
  const { data: layout } = useLayout();
  const { data: employeesData } = useEmployees();
  const [date, setDate] = useState(todayStr());
  const { data: shiftsData } = useShifts(date);
  const { addShift, deleteShift, invalidate } = useShiftMutations(date);

  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showManageLayout, setShowManageLayout] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showNewShiftBlock, setShowNewShiftBlock] = useState(false);
  const [openPopover, setOpenPopover] = useState<{
    shift: Shift;
    cellValue: CellValue;
    subRow: SubRow;
    anchor: { x: number; y: number };
  } | null>(null);

  const pxPerMin = BASE_PX_PER_MIN * zoom;
  const windowStart = toMinutes(OPERATIONAL_START);
  const windowEnd = toMinutes(OPERATIONAL_END);
  const totalWidth = (windowEnd - windowStart) * pxPerMin;

  const employees = employeesData?.employees ?? [];

  const rows: FlatRow[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    const out: FlatRow[] = [];
    for (const section of layout?.sections ?? []) {
      const visibleLocations = section.locations
        .map((loc) => ({
          ...loc,
          subRows: loc.subRows.filter(
            (sr) => !term || sr.label.toLowerCase().includes(term) || loc.name.toLowerCase().includes(term) || section.name.toLowerCase().includes(term)
          ),
        }))
        .filter((loc) => loc.subRows.length > 0);

      if (visibleLocations.length === 0) continue;
      out.push({ kind: 'section', id: section.id, name: section.name });
      for (const loc of visibleLocations) {
        out.push({ kind: 'location', id: loc.id, name: loc.name });
        for (const sr of loc.subRows) {
          out.push({ kind: 'subrow', id: sr.id, label: sr.label, dataType: sr.dataType, subRow: sr });
        }
      }
    }
    return out;
  }, [layout, search]);

  const shiftsBySubRow = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of shiftsData?.shifts ?? []) {
      if (!map.has(shift.subRowId)) map.set(shift.subRowId, []);
      map.get(shift.subRowId)!.push(shift);
    }
    return map;
  }, [shiftsData]);

  function rowHeight(row: FlatRow) {
    if (row.kind === 'section') return SECTION_ROW_HEIGHT;
    if (row.kind === 'location') return LOCATION_ROW_HEIGHT;
    return row.dataType === 'STAFF' || row.dataType === 'TEXT' ? MULTILINE_ROW_HEIGHT : ROW_HEIGHT;
  }

  function openCellEditor(shift: Shift, subRow: SubRow, e: React.MouseEvent) {
    const cellValue = shift.cellValues[0];
    if (!cellValue) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const POPOVER_WIDTH = 288;
    const POPOVER_HEIGHT = 320;
    const PADDING = 8;
    // Anchor x to the click point, not the shift block's own bounding rect
    // — a wide block (long shift, or zoomed in) scrolled so its left edge
    // sits off-screen would otherwise place the popover off-screen too,
    // even though the clicked point itself is always on-screen.
    let x = Math.max(PADDING, Math.min(e.clientX, window.innerWidth - POPOVER_WIDTH - PADDING));
    let y = rect.bottom + 6;
    if (y + POPOVER_HEIGHT > window.innerHeight) y = rect.top - POPOVER_HEIGHT - 6;
    y = Math.max(PADDING, y);
    setOpenPopover({ shift, cellValue, subRow, anchor: { x, y } });
  }

  async function handleAddShift(subRowId: string) {
    await addShift.mutateAsync({ subRowId, date, startTime: OPERATIONAL_START, endTime: OPERATIONAL_END });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search sections, locations, sub-rows..."
        date={date}
        onDateChange={setDate}
        rightExtra={
          <>
            <div className="flex items-center border border-slate-300 rounded-md">
              <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} className="px-2 py-1.5 text-sm hover:bg-slate-50">
                −
              </button>
              <span className="px-2 text-xs text-slate-500">Zoom</span>
              <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="px-2 py-1.5 text-sm hover:bg-slate-50">
                +
              </button>
            </div>
            <button onClick={() => setShowNewShiftBlock(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              + New Shift Block
            </button>
            <button onClick={() => setShowManageLayout(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Manage Layout
            </button>
            <button onClick={() => setShowManageTeam(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
              Manage Team
            </button>
          </>
        }
      />

      {/* Single scroll container: label column and header row are sticky
          within it rather than living in separate scrolling divs, so
          vertical/horizontal scroll never needs manual syncing. */}
      <div className="overflow-auto" style={{ height: 'calc(100vh - 68px)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${LABEL_WIDTH}px ${totalWidth}px`,
            width: LABEL_WIDTH + totalWidth,
            paddingBottom: GRID_BOTTOM_PADDING,
          }}
        >
          {/* corner cell: sticky on both axes, sits above everything */}
          <div
            style={{ height: HEADER_ROW_HEIGHT }}
            className="sticky top-0 left-0 z-30 bg-white border-b border-r border-slate-200"
          />
          {/* time-header row: sticky top-0 */}
          <div style={{ height: HEADER_ROW_HEIGHT }} className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
            <TimeRuler windowStart={windowStart} windowEnd={windowEnd} pxPerMin={pxPerMin} />
          </div>

          {rows.map((row) => (
            <Fragment key={`${row.kind}-${row.id}`}>
              {/* label cell: sticky left-0 */}
              <div
                style={{ height: rowHeight(row) }}
                className={
                  'sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)] ' +
                  (row.kind === 'section'
                    ? 'flex items-center px-3 bg-slate-100 font-semibold text-sm text-slate-700 border-b border-slate-200'
                    : row.kind === 'location'
                    ? 'flex items-center px-5 text-sm font-medium text-slate-600 bg-white border-b border-slate-100'
                    : 'flex items-center justify-between px-7 text-xs text-slate-500 bg-white border-b border-slate-100')
                }
              >
                {row.kind === 'subrow' ? (
                  <>
                    <span className="truncate">{row.label}</span>
                    <button
                      onClick={() => handleAddShift(row.id)}
                      title="Add a shift block on this row"
                      className="text-slate-400 hover:text-slate-800 text-sm px-1"
                    >
                      +
                    </button>
                  </>
                ) : (
                  row.name
                )}
              </div>

              {/* timeline cell: scrolls normally with the rest of the grid */}
              <div
                style={{ height: rowHeight(row), width: totalWidth }}
                className={`relative ${row.kind === 'section' ? 'bg-slate-100 border-b border-slate-200' : 'border-b border-slate-100'}`}
              >
                {row.kind === 'subrow' &&
                  (shiftsBySubRow.get(row.id) ?? []).map((shift) => {
                    const left = (toMinutes(shift.startTime) - windowStart) * pxPerMin;
                    const width = Math.max((toMinutes(shift.endTime) - toMinutes(shift.startTime)) * pxPerMin, 32);
                    const cellValue = shift.cellValues[0];
                    if (!cellValue) return null;
                    return (
                      <button
                        key={shift.id}
                        onClick={(e) => openCellEditor(shift, row.subRow, e)}
                        title={
                          shift.sessionType
                            ? `${shift.sessionType} — ${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}`
                            : `${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}`
                        }
                        style={{ left, width, top: 4, height: rowHeight(row) - 8 }}
                        className="absolute rounded-md border border-slate-200 bg-white hover:border-slate-400 px-2 py-1 flex flex-col items-stretch min-w-0 overflow-hidden text-left shadow-sm"
                      >
                        <span className="text-[9px] leading-tight text-slate-400 truncate flex-shrink-0 flex items-center gap-1">
                          {shift.sessionType && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: SESSION_TYPE_COLORS[shift.sessionType] ?? '#64748b' }}
                            />
                          )}
                          {formatTime12h(shift.startTime)} – {formatTime12h(shift.endTime)}
                        </span>
                        <CellBlock cellValue={cellValue} subRow={row.subRow} />
                      </button>
                    );
                  })}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {openPopover && (
        <CellPopover
          shift={openPopover.shift}
          cellValue={openPopover.cellValue}
          subRow={openPopover.subRow}
          employees={employees}
          anchor={openPopover.anchor}
          onClose={() => setOpenPopover(null)}
          onSaved={invalidate}
          onDeleteShift={() => deleteShift.mutate(openPopover.shift.id)}
        />
      )}

      {showManageLayout && <ManageLayoutModal onClose={() => setShowManageLayout(false)} />}
      {showManageTeam && <ManageTeamModal onClose={() => setShowManageTeam(false)} />}
      {showNewShiftBlock && <NewShiftBlockModal date={date} onClose={() => setShowNewShiftBlock(false)} />}
    </div>
  );
}

function TimeRuler({ windowStart, windowEnd, pxPerMin }: { windowStart: number; windowEnd: number; pxPerMin: number }) {
  const marks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += 60) marks.push(m);

  return (
    <div style={{ height: HEADER_ROW_HEIGHT }} className="relative h-full">
      {marks.map((m) => (
        <div
          key={m}
          style={{ left: (m - windowStart) * pxPerMin }}
          className="absolute top-0 h-full flex items-center text-xs text-slate-400 border-l border-slate-100 pl-1"
        >
          {formatTime12h(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)}
        </div>
      ))}
    </div>
  );
}
