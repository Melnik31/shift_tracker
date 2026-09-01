import { DataType, Employee, StatusValue, STATUS_VALUES, CellValue } from '../lib/types';

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
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
}

export default function CellFieldEditor({ dataType, state, onChange, employees, onKeyDown, autoFocus }: Props) {
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

    case 'BADGE':
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
          <div className="flex gap-1.5">
            {BADGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ ...state, badgeColor: c })}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 ${state.badgeColor === c ? 'border-slate-900' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>
      );

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

    case 'STAFF':
      return (
        <div className="max-h-36 overflow-y-auto space-y-1">
          {employees.map((emp) => (
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
        </div>
      );

    default:
      return null;
  }
}
