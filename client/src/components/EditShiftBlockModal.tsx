import { FormEvent, useState } from 'react';
import Modal from './Modal';
import CellFieldEditor, {
  CellFieldState,
  cellFieldPayload,
  cellFieldStateFromValue,
  emptyCellFieldState,
  isCellFieldStateFilled,
} from './CellFieldEditor';
import { useLayout } from '../hooks/useLayout';
import { useEmployees } from '../hooks/useEmployees';
import { useShifts } from '../hooks/useShifts';
import { api } from '../lib/api';
import { Shift, SESSION_TYPES, SubRow } from '../lib/types';
import { DATA_TYPE_INFO } from '../lib/constants';

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface Props {
  shift: Shift;
  subRow: SubRow;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}

// Editing an entire "shift block" at once, triggered by clicking any
// existing shift block in Matrix View: every SubRow under the clicked
// shift's Location that has a shift overlapping the clicked shift's
// original time window is treated as a member of the same block — this
// mirrors how "New Shift Block" creates them together in the first place
// (one date/startTime/endTime/sessionType shared across every SubRow).
// Shared Start/End/Session type/Cancelled are applied to every member on
// save; each row keeps its own field content, edited with the same
// CellFieldEditor the single-cell popover (CellPopover) uses. Membership
// is captured once at mount (from `shift`'s original times) so editing the
// shared start/end doesn't cause rows to appear/disappear mid-edit.
export default function EditShiftBlockModal({ shift, subRow, date, onClose, onSaved }: Props) {
  const { data: layout } = useLayout();
  const { data: shiftsData } = useShifts(date);

  const section = layout?.sections.find((s) => s.locations.some((l) => l.id === subRow.locationId)) ?? null;
  const location = section?.locations.find((l) => l.id === subRow.locationId) ?? null;
  const { data: employeesData } = useEmployees(section?.campusId);
  const subRows = location?.subRows ?? [];
  const employees = employeesData?.employees ?? [];
  const shifts = shiftsData?.shifts ?? [];

  const blockStart = shift.startTime;
  const blockEnd = shift.endTime;

  function memberShift(subRowId: string): Shift | undefined {
    return shifts.find((s) => s.subRowId === subRowId && timeRangesOverlap(s.startTime, s.endTime, blockStart, blockEnd));
  }

  // Lazy initializer runs once on mount. By the time this modal can open
  // (the user clicked an already-rendered shift block), both `layout` and
  // this exact `useShifts(date)` query are already populated in the React
  // Query cache under the same key MatrixView uses, so `shifts`/`subRows`
  // here are the real data on the very first render, not an empty flash.
  const [rowStates, setRowStates] = useState<Record<string, CellFieldState>>(() => {
    const map: Record<string, CellFieldState> = {};
    for (const sr of subRows) {
      const cv = memberShift(sr.id)?.cellValues[0];
      map[sr.id] = cv ? cellFieldStateFromValue(cv) : emptyCellFieldState();
    }
    return map;
  });

  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [sessionType, setSessionType] = useState(shift.sessionType ?? '');
  const [cancelled, setCancelled] = useState(shift.cancelled ?? false);
  const [rowFiles, setRowFiles] = useState<Record<string, File | null>>({});
  // Keyed by subRowId, not shiftId — once a row is deleted, refetching
  // `shifts` makes memberShift(subRowId) resolve to undefined for it, so a
  // set of shiftIds would "forget" the removal and the row's still-filled
  // local CellFieldState would look like a brand-new row to create on Save.
  const [removedSubRowIds, setRemovedSubRowIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  function rowState(subRowId: string) {
    return rowStates[subRowId] ?? emptyCellFieldState();
  }
  function setRowState(subRowId: string, next: CellFieldState) {
    setRowStates((prev) => ({ ...prev, [subRowId]: next }));
  }

  async function handleFileDelete(fileId: string) {
    await api.delete(`/shifts/files/${fileId}`);
    onSaved();
  }

  async function handleRemoveRow(subRowId: string, memberShiftId: string) {
    if (!confirm('Remove this row from the block?')) return;
    await api.delete(`/shifts/${memberShiftId}`);
    setRemovedSubRowIds((prev) => new Set(prev).add(subRowId));
    onSaved();
  }

  async function handleDeleteBlock() {
    if (!confirm('Delete every row in this shift block? This cannot be undone.')) return;
    setDeletingAll(true);
    try {
      for (const sr of subRows) {
        if (removedSubRowIds.has(sr.id)) continue;
        const member = memberShift(sr.id);
        if (member) {
          await api.delete(`/shifts/${member.id}`);
        }
      }
      onSaved();
      onClose();
    } finally {
      setDeletingAll(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    setSubmitting(true);
    try {
      for (const sr of subRows) {
        if (removedSubRowIds.has(sr.id)) continue;
        const member = memberShift(sr.id);

        if (sr.dataType === 'FILE') {
          const file = rowFiles[sr.id];
          if (member) {
            await api.patch(`/shifts/${member.id}`, { startTime, endTime, sessionType: sessionType || null, cancelled });
            if (file) {
              const form = new FormData();
              form.append('file', file);
              await api.post(`/shifts/cells/${member.cellValues[0].id}/files`, form);
            }
          } else if (file) {
            const created = await api.post<Shift>('/shifts', { subRowId: sr.id, date, startTime, endTime, sessionType: sessionType || null });
            const form = new FormData();
            form.append('file', file);
            await api.post(`/shifts/cells/${created.cellValues[0].id}/files`, form);
          }
          continue;
        }

        const state = rowState(sr.id);
        if (member) {
          await api.patch(`/shifts/${member.id}`, { startTime, endTime, sessionType: sessionType || null, cancelled });
          await api.patch(`/shifts/cells/${member.cellValues[0].id}`, cellFieldPayload(sr.dataType, state));
        } else if (isCellFieldStateFilled(sr.dataType, state)) {
          const created = await api.post<Shift>('/shifts', { subRowId: sr.id, date, startTime, endTime, sessionType: sessionType || null });
          await api.patch(`/shifts/cells/${created.cellValues[0].id}`, cellFieldPayload(sr.dataType, state));
        }
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Could not save shift block');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit Shift Block${location ? ` — ${location.name}` : ''}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-slate-500">{date}</p>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Session type</label>
          <select
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {SESSION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.target.checked)} />
          Cancelled — excludes every row in this block from payable hours
        </label>

        <div className="border-t border-slate-200 pt-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">Start/End/Session type/Cancelled above apply to every row below.</p>
          {subRows.length === 0 && <p className="text-xs text-slate-400">This location has no rows.</p>}
          {subRows.map((sr) => {
            const member = memberShift(sr.id);
            const removed = removedSubRowIds.has(sr.id);
            if (removed) {
              return (
                <div key={sr.id} className="border border-slate-100 rounded-md p-3 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
                  <span>{sr.label}</span>
                  <span>Removed</span>
                </div>
              );
            }
            return (
              <div key={sr.id} className="border border-slate-200 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{sr.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{DATA_TYPE_INFO[sr.dataType].label}</span>
                    {member && (
                      <button type="button" onClick={() => handleRemoveRow(sr.id, member.id)} className="text-xs text-red-500 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {sr.dataType === 'FILE' ? (
                  <div>
                    {member?.cellValues[0]?.fileUploads && member.cellValues[0].fileUploads.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {member.cellValues[0].fileUploads.map((f) => (
                          <li key={f.id} className="flex items-center justify-between text-sm text-slate-700">
                            <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                              📎 {f.filename}
                            </a>
                            <button type="button" onClick={() => handleFileDelete(f.id)} className="text-xs text-red-500 hover:underline ml-2">
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <input
                      type="file"
                      onChange={(e) => setRowFiles((prev) => ({ ...prev, [sr.id]: e.target.files?.[0] ?? null }))}
                      className="text-xs"
                    />
                  </div>
                ) : (
                  <CellFieldEditor dataType={sr.dataType} state={rowState(sr.id)} onChange={(next) => setRowState(sr.id, next)} employees={employees} />
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleDeleteBlock}
            disabled={deletingAll}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {deletingAll ? 'Deleting…' : 'Delete entire block'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save Block'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
