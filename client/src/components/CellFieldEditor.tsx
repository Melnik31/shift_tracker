import { useRef, useState } from 'react';
import { DataType, Employee, StatusValue, STATUS_VALUES, CellValue } from '../lib/types';
import { employeeVisibleOnStaffField } from '../lib/staffRoles';
import { useBadgeColors, useBadgeColorMutations } from '../hooks/useBadgeColors';

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
  // The Staff sub-row's own label, plus every Staff-field label used
  // anywhere in the workspace — together decide which employees show up as
  // assignable options (see lib/staffRoles.ts's employeeVisibleOnStaffField).
  subRowLabel?: string;
  knownStaffLabels?: Set<string>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
}

export default function CellFieldEditor({ dataType, state, onChange, employees, subRowLabel, knownStaffLabels, onKeyDown, autoFocus }: Props) {
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
                    onClick={(e) => {
                      e.stopPropagation();
                      removeColor.mutate(c.id);
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
                    onClick={(e) => {
                      e.stopPropagation();
                      removeColor.mutate(c.id);
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
      const roleFiltered = subRowLabel
        ? employees.filter((e) => employeeVisibleOnStaffField(e.roles, subRowLabel, knownStaffLabels ?? new Set()))
        : employees;
      const term = search.trim().toLowerCase();
      const visibleEmployees = term ? roleFiltered.filter((e) => e.name.toLowerCase().includes(term)) : roleFiltered;
      return (
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full mb-1.5 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <div className="max-h-36 overflow-y-auto space-y-1">
            {visibleEmployees.map((emp) => (
              <label key={emp.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={state.staffIds.includes(emp.id)}
                  onChange={(e) =>
                    onChange({ ...state, staffIds: e.target.checked ? [...state.staffIds, emp.id] : state.staffIds.filter((id) => id !== emp.id) })
                  }
                />
                {emp.name}
              </label>
            ))}
            {visibleEmployees.length === 0 && <p className="text-xs text-slate-400 px-1 py-1">No employees match "{search}"</p>}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
