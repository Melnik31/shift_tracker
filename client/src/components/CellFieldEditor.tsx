import { useRef, useState } from 'react';
import { matchesName, scheduleName } from '../lib/names';
import { DataType, Employee, StatusValue, STATUS_VALUES, CellValue } from '../lib/types';
import { employeeVisibleOnStaffField } from '../lib/staffRoles';
import { useBadgeColors, useBadgeColorMutations } from '../hooks/useBadgeColors';
import { useConfirm } from './ConfirmProvider';

// Shared by CellPopover (editing an existing shift's cell) and
// NewShiftBlockModal (composing several not-yet-created shifts at once) so
// the per-dataType input for TEXT/BADGE/STATUS/LINK/STAFF is implemented
// exactly once. FILE is deliberately not handled here — it needs a real
// cellValueId to upload against, which only exists once a shift is actually
// created, so each caller renders its own FILE control.

export const BADGE_COLORS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#64748b'];

export interface CellFieldState {
  textValue: string;
  badgeLabel: string;
  badgeColor: string;
  statusValue: StatusValue | '';
  linkUrl: string;
  staffIds: string[];
}

export function emptyCellFieldState(): CellFieldState {
  return { textValue: '', badgeLabel: '', badgeColor: BADGE_COLORS[0], statusValue: '', linkUrl: '', staffIds: [] };
}

export function cellFieldStateFromValue(cv: CellValue): CellFieldState {
  return {
    textValue: cv.textValue ?? '',
    badgeLabel: cv.badgeLabel ?? '',
    badgeColor: cv.badgeColor ?? BADGE_COLORS[0],
    statusValue: cv.statusValue ?? '',
    linkUrl: cv.linkUrl ?? '',
    staffIds: cv.staffAssignments.map((a) => a.employee.id),
  };
}

/** Whether this dataType's relevant field(s) have anything in them — used to decide whether a row should create a shift at all. FILE is handled by the caller. */
export function isCellFieldStateFilled(dataType: DataType, state: CellFieldState): boolean {
  switch (dataType) {
    case 'TEXT':
      return state.textValue.trim() !== '';
    case 'BADGE':
      return state.badgeLabel.trim() !== '';
    case 'STATUS':
      return state.statusValue !== '';
    case 'LINK':
      return state.linkUrl.trim() !== '';
    case 'STAFF':
      return state.staffIds.length > 0;
    default:
      return false;
  }
}

/** Builds the same PATCH /shifts/cells/:id payload shape CellPopover has always sent. */
export function cellFieldPayload(dataType: DataType, state: CellFieldState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (dataType === 'TEXT') payload.textValue = state.textValue;
  if (dataType === 'BADGE') {
    payload.badgeLabel = state.badgeLabel;
    payload.badgeColor = state.badgeColor;
  }
  if (dataType === 'STATUS') payload.statusValue = state.statusValue || null;
  if (dataType === 'LINK') {
    payload.linkUrl = state.linkUrl;
    payload.textValue = state.textValue; // reused as the link's display label (e.g. a drill name)
  }
  if (dataType === 'STAFF') payload.staffEmployeeIds = state.staffIds;
  return payload;
}

interface Props {
  dataType: DataType;
  state: CellFieldState;
  onChange: (next: CellFieldState) => void;
  employees: Employee[];
  // The Staff sub-row's own label — only employees with a role of that name
  // show up as assignable options (see lib/staffRoles.ts).
  subRowLabel?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  // Employees with approved time off on this shift's date — shown grayed out
  // and can't be newly checked (the server drops them anyway).
  offEmployeeIds?: Set<string>;
  // Coaches from OTHER campuses, offered only to Admin/CEO and only after the
  // "Show all coaches" button is pressed on purpose — the picker is
  // campus-only by default. Picking one asks for confirmation first.
  otherCampusEmployees?: Employee[];
  // Coaches already on this shift from another campus (put there by an
  // Admin/CEO): always listed so they stay visible and can be removed.
  assignedElsewhere?: Employee[];
  campusName?: string;
}

export default function CellFieldEditor({
  dataType,
  state,
  onChange,
  employees,
  subRowLabel,
  onKeyDown,
  autoFocus,
  offEmployeeIds,
  otherCampusEmployees,
  assignedElsewhere,
  campusName,
}: Props) {
  switch (dataType) {
    case 'TEXT':
      return (
        <textarea
          autoFocus={autoFocus}
          value={state.textValue}
          onChange={(e) => onChange({ ...state, textValue: e.target.value })}
          onKeyDown={onKeyDown}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="e.g. Setup notes, post instructions..."
        />
      );

    case 'BADGE': {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- dataType is fixed for the lifetime of a given CellFieldEditor instance (one per SubRow), same reasoning as the STAFF case below.
      const { data: badgeColorsData } = useBadgeColors();
      const { saveColor, removeColor } = useBadgeColorMutations();
      const confirm = useConfirm();
      const colorInputRef = useRef<HTMLInputElement>(null);
      const [showSaveForm, setShowSaveForm] = useState(false);
      const [presetName, setPresetName] = useState('');

      const savedColors = (badgeColorsData?.colors ?? []).filter((c) => !BADGE_COLORS.includes(c.color));
      const knownColors = [...BADGE_COLORS, ...savedColors.map((c) => c.color)];
      const canSaveCurrentColor = state.badgeColor.length > 0 && !knownColors.includes(state.badgeColor);

      return (
        <div>
          <input
            autoFocus={autoFocus}
            value={state.badgeLabel}
            onChange={(e) => onChange({ ...state, badgeLabel: e.target.value })}
            onKeyDown={onKeyDown}
            className="w-full mb-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. High, Headliner"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {BADGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ ...state, badgeColor: c })}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 ${state.badgeColor === c ? 'border-slate-900' : 'border-transparent'}`}
              />
            ))}
            {savedColors.map((c) =>
              c.label ? (
                <div key={c.id} className="relative group">
                  <button
                    type="button"
                    title={c.label}
                    onClick={() => onChange({ ...state, badgeColor: c.color, badgeLabel: c.label as string })}
                    className={`flex items-center gap-1 pl-1 pr-2 h-6 rounded-full border-2 bg-white text-xs text-slate-700 ${
                      state.badgeColor === c.color ? 'border-slate-900' : 'border-slate-200'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full flex-none" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </button>
                  <button
                    type="button"
                    title="Remove saved color"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirm({ title: `Remove saved color${c.label ? ` "${c.label}"` : ''}?`, message: 'It is removed from the quick-pick list for everyone in this workspace. Shifts already using it keep their color.', confirmLabel: 'Remove color' })) removeColor.mutate(c.id);
                    }}
                    className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-700 text-white text-[8px] leading-none"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div key={c.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, badgeColor: c.color })}
                    style={{ backgroundColor: c.color }}
                    className={`w-6 h-6 rounded-full border-2 ${state.badgeColor === c.color ? 'border-slate-900' : 'border-transparent'}`}
                  />
                  <button
                    type="button"
                    title="Remove saved color"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirm({ title: `Remove saved color${c.label ? ` "${c.label}"` : ''}?`, message: 'It is removed from the quick-pick list for everyone in this workspace. Shifts already using it keep their color.', confirmLabel: 'Remove color' })) removeColor.mutate(c.id);
                    }}
                    className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-700 text-white text-[8px] leading-none"
                  >
                    ✕
                  </button>
                </div>
              )
            )}
            <button
              type="button"
              title="Pick a custom color"
              onClick={() => colorInputRef.current?.click()}
              className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300 text-slate-400 text-xs leading-none flex items-center justify-center hover:border-slate-400 hover:text-slate-600"
            >
              +
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(state.badgeColor) ? state.badgeColor : '#000000'}
              onChange={(e) => onChange({ ...state, badgeColor: e.target.value })}
              className="sr-only"
            />
          </div>
          {canSaveCurrentColor && !showSaveForm && (
            <button
              type="button"
              onClick={() => {
                setPresetName(state.badgeLabel);
                setShowSaveForm(true);
              }}
              className="mt-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium"
            >
              + Save this color for quick selection
            </button>
          )}
          {canSaveCurrentColor && showSaveForm && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowSaveForm(false);
                }}
                placeholder="Name this color"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={!presetName.trim()}
                onClick={() => {
                  saveColor.mutate({ color: state.badgeColor, label: presetName.trim() });
                  setShowSaveForm(false);
                }}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:text-slate-300"
              >
                Save
              </button>
              <button type="button" onClick={() => setShowSaveForm(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    }

    case 'STATUS':
      return (
        <select
          autoFocus={autoFocus}
          value={state.statusValue}
          onChange={(e) => onChange({ ...state, statusValue: e.target.value as StatusValue })}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">—</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      );

    case 'LINK':
      return (
        <div className="space-y-2">
          <input
            autoFocus={autoFocus}
            value={state.textValue}
            onChange={(e) => onChange({ ...state, textValue: e.target.value })}
            onKeyDown={onKeyDown}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Link label, e.g. Change of Angle"
          />
          <input
            value={state.linkUrl}
            onChange={(e) => onChange({ ...state, linkUrl: e.target.value })}
            onKeyDown={onKeyDown}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="https://... or #drill/..."
          />
        </div>
      );

    case 'STAFF': {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- dataType is fixed for the lifetime of a given CellFieldEditor instance (one per SubRow), so this branch, once taken, is taken on every render of that instance.
      const [search, setSearch] = useState('');
      // Always starts off — showing other campuses' coaches is a deliberate act.
      // eslint-disable-next-line react-hooks/rules-of-hooks -- same reasoning as above.
      const [showAll, setShowAll] = useState(false);
      // eslint-disable-next-line react-hooks/rules-of-hooks -- same reasoning as above.
      const confirm = useConfirm();
      const byRole = (list: Employee[]) =>
        // Coaches already ticked stay listed even without the role, so an existing assignment can still be seen and removed.
        subRowLabel ? list.filter((e) => state.staffIds.includes(e.id) || employeeVisibleOnStaffField(e.roles, subRowLabel)) : list;
      const elsewhere = assignedElsewhere ?? [];
      const elsewhereIds = new Set(elsewhere.map((e) => e.id));
      const others = (otherCampusEmployees ?? []).filter((e) => !elsewhereIds.has(e.id));
      const outsiderIds = new Set([...elsewhere, ...others].map((e) => e.id));
      const term = search.trim().toLowerCase();
      const roleFiltered = [...byRole(employees), ...elsewhere, ...(showAll ? byRole(others) : [])];
      const visibleEmployees = term ? roleFiltered.filter((e) => matchesName(e, term)) : roleFiltered;
      const selectedOutsiders = [...elsewhere, ...others].filter((e) => state.staffIds.includes(e.id));
      return (
        <div>
          <div className="flex gap-1.5 mb-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            {others.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                title="Coaches from other campuses can be added to this shift only on purpose"
                className="flex-shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {showAll ? 'Show campus coaches only' : 'Show all coaches'}
              </button>
            )}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {visibleEmployees.map((emp) => {
              const checked = state.staffIds.includes(emp.id);
              const outsider = outsiderIds.has(emp.id);
              const off = !!offEmployeeIds?.has(emp.id);
              // An already-checked off employee stays uncheckable, so they
              // can be removed — never trapped on the shift.
              const disabled = off && !checked;
              return (
                <label
                  key={emp.id}
                  title={off ? 'Approved time off on this date' : undefined}
                  className={`flex items-center gap-2 text-sm ${off ? 'text-slate-400' : 'text-slate-700'} ${disabled ? 'cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      if (next && outsider) {
                        const ok = await confirm({
                          title: `Add ${scheduleName(emp)} from another campus?`,
                          message: `${scheduleName(emp)} isn't assigned to ${campusName ?? 'this campus'}. They'll be scheduled here for this shift only — their campus assignment isn't changed.`,
                          confirmLabel: 'Add to shift',
                          destructive: false,
                        });
                        if (!ok) return;
                      }
                      onChange({ ...state, staffIds: next ? [...state.staffIds, emp.id] : state.staffIds.filter((id) => id !== emp.id) });
                    }}
                  />
                  <span className={off ? 'line-through' : ''} title={emp.preferredName ? emp.name : undefined}>{scheduleName(emp)}</span>
                  {outsider && (
                    <span
                      title={emp.campuses?.length ? `Assigned to: ${emp.campuses.map((c) => c.name).join(', ')}` : 'Not assigned to this campus'}
                      className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {emp.campuses?.length ? emp.campuses.map((c) => c.name).join(', ') : 'Other campus'}
                    </span>
                  )}
                  {off && <span className="rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px] font-medium">Time off</span>}
                </label>
              );
            })}
            {visibleEmployees.length === 0 && (
              <p className="text-xs text-slate-400 px-1 py-1">
                {term
                  ? `No employees match "${search}"`
                  : subRowLabel
                    ? `No coaches have the role "${subRowLabel}". Add that role to a coach in Manage Team.`
                    : 'No employees to show.'}
              </p>
            )}
          </div>
          {selectedOutsiders.length > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
              <span className="font-medium">{selectedOutsiders.map((e) => scheduleName(e)).join(', ')}</span> {selectedOutsiders.length === 1 ? 'is' : 'are'} from another campus — scheduled on this shift only; their campus assignment isn't changed.
            </p>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
