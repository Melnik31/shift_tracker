import { Fragment, useMemo, useState } from 'react';
import { useLayout } from '../hooks/useLayout';
import { useShifts, useShiftMutations } from '../hooks/useShifts';
import { useAuth } from '../hooks/useAuth';
import { toMinutes, formatTime12h } from '../lib/time';
import { OPERATIONAL_START, OPERATIONAL_END, SESSION_TYPE_COLORS } from '../lib/constants';
import { Shift, SubRow } from '../lib/types';
import { computeLanes, LaneShift } from '../lib/lanes';
import { colorForBlock, blockColorFromBadge } from '../lib/colors';
import CellBlock from '../components/CellBlock';
import CampusSelector from '../components/CampusSelector';
import { useCampuses } from '../hooks/useCampuses';
import EditShiftBlockModal from '../components/EditShiftBlockModal';
import ManageAdminsModal from '../components/ManageAdminsModal';
import ManageCampusesModal from '../components/ManageCampusesModal';
import ManageWorkspaceModal from '../components/ManageWorkspaceModal';
import ManageLayoutModal from '../components/ManageLayoutModal';
import ManageTeamModal from '../components/ManageTeamModal';
import ManageMenu from '../components/ManageMenu';
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
const LANE_GAP_PX = 4; // vertical gap between stacked overlap lanes within one SubRow
const MIN_SHIFT_WIDTH_PX = 32;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// What makes several Shifts "the same practice" for lane alignment and
// color (see lib/lanes.ts): a shared blockId when the shifts were created
// together via New Shift Block. Most real data isn't that clean though —
// shifts added individually, or seeded/imported some other way, never get a
// blockId — so shifts without one fall back to matching on Location + exact
// date/start/end, the same "block membership" heuristic
// EditShiftBlockModal.tsx already uses to reconstruct a block for editing.
// Two shifts landing on this fallback only by coincidence (same location,
// same exact times, genuinely unrelated) is a rare, purely-cosmetic
// mis-grouping — never a data risk, since this key is never written back.
function groupKeyFor(shift: Shift, locationId: string): string {
  return shift.blockId ?? `${locationId}|${shift.date}|${shift.startTime}|${shift.endTime}`;
}

type FlatRow =
  | { kind: 'section'; id: string; name: string }
  | { kind: 'location'; id: string; name: string }
  | { kind: 'subrow'; id: string; label: string; dataType: SubRow['dataType']; subRow: SubRow; locationId: string };

export default function MatrixView() {
  const { data: me } = useAuth();
  const [campusId, setCampusId] = useState<string | null>(null);
  const { data: layout } = useLayout(campusId);
  const [date, setDate] = useState(todayStr());
  const { data: shiftsData } = useShifts(date, campusId);
  const { addShift, invalidate } = useShiftMutations(date);

  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showManageLayout, setShowManageLayout] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [showManageAdmins, setShowManageAdmins] = useState(false);
  const [showManageCampuses, setShowManageCampuses] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showNewShiftBlock, setShowNewShiftBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<{ shift: Shift; subRow: SubRow } | null>(null);
  const canManageAdmins = me?.admin?.role === 'ADMIN' || me?.admin?.role === 'CEO';
  const { data: campusData } = useCampuses();
  const selectedCampusName = campusId ? campusData?.campuses.find((c) => c.id === campusId)?.name : null;

  const pxPerMin = BASE_PX_PER_MIN * zoom;
  const windowStart = toMinutes(OPERATIONAL_START);
  const windowEnd = toMinutes(OPERATIONAL_END);
  const totalWidth = (windowEnd - windowStart) * pxPerMin;

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
          out.push({ kind: 'subrow', id: sr.id, label: sr.label, dataType: sr.dataType, subRow: sr, locationId: loc.id });
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

  // Every visible (post-search-filter) shift under a Location, flattened
  // across its SubRows and tagged with the group it belongs to (see
  // groupKeyFor above). Feeds computeLanes per Location below, so a
  // practice lands in the same lane across every SubRow of that Location.
  const locationShiftLists = useMemo(() => {
    const map = new Map<string, LaneShift[]>();
    for (const row of rows) {
      if (row.kind !== 'subrow') continue;
      if (!map.has(row.locationId)) map.set(row.locationId, []);
      const list = map.get(row.locationId)!;
      for (const shift of shiftsBySubRow.get(row.id) ?? []) {
        list.push({ id: shift.id, groupKey: groupKeyFor(shift, row.locationId), startTime: shift.startTime, endTime: shift.endTime });
      }
    }
    return map;
  }, [rows, shiftsBySubRow]);

  // The BADGE color chosen for a practice, if it has one — the first BADGE
  // SubRow with a value wins (deterministic: SubRows are already in the
  // layout's own sortOrder). A group with no BADGE cell at all (or one left
  // blank) has no entry here, and falls back to colorForBlock's hash-based
  // color — see the render below.
  const groupBadgeColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.kind !== 'subrow' || row.dataType !== 'BADGE') continue;
      for (const shift of shiftsBySubRow.get(row.id) ?? []) {
        const groupKey = groupKeyFor(shift, row.locationId);
        const badgeColor = shift.cellValues[0]?.badgeColor;
        if (badgeColor && !map.has(groupKey)) map.set(groupKey, badgeColor);
      }
    }
    return map;
  }, [rows, shiftsBySubRow]);

  const laneResultByLocation = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeLanes>>();
    for (const [locationId, shifts] of locationShiftLists) {
      map.set(locationId, computeLanes(shifts, { pxPerMin, windowStartMin: windowStart, minWidthPx: MIN_SHIFT_WIDTH_PX }));
    }
    return map;
  }, [locationShiftLists, pxPerMin, windowStart]);

  function perLaneHeight(dataType: SubRow['dataType']) {
    return dataType === 'STAFF' || dataType === 'TEXT' ? MULTILINE_ROW_HEIGHT : ROW_HEIGHT;
  }

  function rowHeight(row: FlatRow) {
    if (row.kind === 'section') return SECTION_ROW_HEIGHT;
    if (row.kind === 'location') return LOCATION_ROW_HEIGHT;
    const laneCount = laneResultByLocation.get(row.locationId)?.laneCount ?? 1;
    const perLane = perLaneHeight(row.dataType);
    return laneCount * perLane + (laneCount - 1) * LANE_GAP_PX;
  }

  function openCellEditor(shift: Shift, subRow: SubRow) {
    setEditingBlock({ shift, subRow });
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
        showAddShiftButton={false}
        filterExtra={
          <>
            <CampusSelector value={campusId} onChange={setCampusId} />
            <div className="flex items-center border border-slate-300 rounded-md">
              <button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} className="px-2 py-1.5 text-sm hover:bg-slate-50">
                −
              </button>
              <span className="px-2 text-xs text-slate-500">Zoom</span>
              <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="px-2 py-1.5 text-sm hover:bg-slate-50">
                +
              </button>
            </div>
          </>
        }
        actionsExtra={
          <>
            <ManageMenu
              items={[
                { label: 'Manage Layout', onClick: () => setShowManageLayout(true) },
                { label: 'Manage Team', onClick: () => setShowManageTeam(true) },
                ...(canManageAdmins
                  ? [
                      { label: 'Manage Admins', onClick: () => setShowManageAdmins(true) },
                      { label: 'Manage Campuses', onClick: () => setShowManageCampuses(true) },
                      { label: 'Workspace Settings', onClick: () => setShowWorkspaceSettings(true) },
                    ]
                  : []),
              ]}
            />
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
                    const width = Math.max((toMinutes(shift.endTime) - toMinutes(shift.startTime)) * pxPerMin, MIN_SHIFT_WIDTH_PX);
                    const cellValue = shift.cellValues[0];
                    if (!cellValue) return null;
                    const groupKey = groupKeyFor(shift, row.locationId);
                    const lane = laneResultByLocation.get(row.locationId)?.lanes.get(groupKey) ?? 0;
                    const perLane = perLaneHeight(row.dataType);
                    const badgeColor = groupBadgeColor.get(groupKey);
                    const { accent, tint } = badgeColor ? blockColorFromBadge(badgeColor) : colorForBlock(groupKey);
                    return (
                      <button
                        key={shift.id}
                        onClick={() => openCellEditor(shift, row.subRow)}
                        title={
                          shift.sessionType
                            ? `${shift.sessionType} — ${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}`
                            : `${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}`
                        }
                        style={{
                          left,
                          width,
                          top: 4 + lane * (perLane + LANE_GAP_PX),
                          height: perLane - 8,
                          borderLeftColor: accent,
                          borderLeftWidth: 3,
                          backgroundColor: tint,
                        }}
                        className="absolute rounded-md border border-slate-200 hover:border-slate-400 px-2 py-1 flex flex-col items-stretch min-w-0 overflow-hidden text-left shadow-sm"
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

        {layout && rows.length === 0 && (
          <div className="max-w-md mx-auto text-center py-16 px-4">
            <p className="text-sm text-slate-500">
              {search.trim()
                ? 'No sections, locations, or rows match your search.'
                : selectedCampusName
                ? `No sections yet in ${selectedCampusName}.`
                : 'No sections yet.'}
            </p>
            {!search.trim() && (
              <p className="text-xs text-slate-400 mt-1">
                Use <span className="font-medium">Manage Layout</span> to add one
                {selectedCampusName ? ` — it'll default to ${selectedCampusName} while that campus is selected` : ''}.
              </p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowNewShiftBlock(true)}
        title="New Shift Block"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-slate-900 text-white text-2xl font-light shadow-lg hover:bg-slate-700 flex items-center justify-center"
      >
        +
      </button>

      {editingBlock && (
        <EditShiftBlockModal
          key={editingBlock.shift.id}
          shift={editingBlock.shift}
          subRow={editingBlock.subRow}
          date={date}
          onClose={() => setEditingBlock(null)}
          onSaved={invalidate}
        />
      )}

      {showManageLayout && <ManageLayoutModal campusId={campusId} onClose={() => setShowManageLayout(false)} />}
      {showManageTeam && <ManageTeamModal campusId={campusId} onClose={() => setShowManageTeam(false)} />}
      {showManageAdmins && <ManageAdminsModal onClose={() => setShowManageAdmins(false)} />}
      {showManageCampuses && <ManageCampusesModal onClose={() => setShowManageCampuses(false)} />}
      {showWorkspaceSettings && <ManageWorkspaceModal onClose={() => setShowWorkspaceSettings(false)} />}
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
