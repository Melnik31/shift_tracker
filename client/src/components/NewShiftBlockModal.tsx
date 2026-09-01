import { FormEvent, useState } from 'react';
import Modal from './Modal';
import CellFieldEditor, { CellFieldState, cellFieldPayload, emptyCellFieldState, isCellFieldStateFilled } from './CellFieldEditor';
import { useLayout } from '../hooks/useLayout';
import { useEmployees } from '../hooks/useEmployees';
import { useShifts, useBulkShiftMutation } from '../hooks/useShifts';
import { api } from '../lib/api';
import { BulkShiftRow, SESSION_TYPES } from '../lib/types';

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// "New Shift Block": one date/startTime/endTime/sessionType entered once,
// then one input per SubRow under a chosen Location, reusing the exact same
// per-dataType editor as the single-shift popover (CellFieldEditor). Rows
// left blank are skipped; rows that already have an overlapping shift on
// that SubRow/date/time are flagged and excluded before submit, then
// re-checked server-side (POST /shifts/bulk) as the source of truth.
export default function NewShiftBlockModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: layout } = useLayout();
  const { data: employeesData } = useEmployees();
  const [blockDate, setBlockDate] = useState(date);
  const { data: shiftsData } = useShifts(blockDate);
  const bulkCreate = useBulkShiftMutation();

  const sections = layout?.sections ?? [];
  const [sectionId, setSectionId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [sessionType, setSessionType] = useState('');
  const [rowStates, setRowStates] = useState<Record<string, CellFieldState>>({});
  const [rowFiles, setRowFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; skipped: { subRowId: string; reason: string }[] } | null>(null);

  const section = sections.find((s) => s.id === sectionId);
  const locations = section?.locations ?? [];
  const location = locations.find((l) => l.id === locationId);
  const subRows = location?.subRows ?? [];
  const employees = employeesData?.employees ?? [];
  const shifts = shiftsData?.shifts ?? [];

  function conflictFor(subRowId: string) {
    return shifts.some((s) => s.subRowId === subRowId && timeRangesOverlap(s.startTime, s.endTime, startTime, endTime));
  }

  function rowState(subRowId: string) {
    return rowStates[subRowId] ?? emptyCellFieldState();
  }
  function setRowState(subRowId: string, next: CellFieldState) {
    setRowStates((prev) => ({ ...prev, [subRowId]: next }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!locationId) {
      setError('Choose a section and location first');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }

    const rows: BulkShiftRow[] = [];
    for (const sr of subRows) {
      if (conflictFor(sr.id)) continue;
      if (sr.dataType === 'FILE') {
        if (rowFiles[sr.id]) rows.push({ subRowId: sr.id, hasFile: true });
        continue;
      }
      const state = rowState(sr.id);
      if (!isCellFieldStateFilled(sr.dataType, state)) continue;
      rows.push({ subRowId: sr.id, ...cellFieldPayload(sr.dataType, state) });
    }

    if (rows.length === 0) {
      setError('Fill in at least one row');
      return;
    }

    setSubmitting(true);
    try {
      const res = await bulkCreate.mutateAsync({ date: blockDate, startTime, endTime, sessionType: sessionType || null, rows });
      for (const c of res.created) {
        const file = rowFiles[c.subRowId];
        if (file) {
          const form = new FormData();
          form.append('file', file);
          await api.post(`/shifts/cells/${c.cellValueId}/files`, form);
        }
      }
      setResult({ createdCount: res.created.length, skipped: res.skipped });
    } catch (err: any) {
      setError(err.message ?? 'Could not create shifts');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal title="New Shift Block" onClose={onClose}>
        <p className="text-sm text-slate-700 mb-2">
          Created {result.createdCount} shift{result.createdCount === 1 ? '' : 's'}.
        </p>
        {result.skipped.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Skipped:</p>
            <ul className="text-xs text-slate-500 space-y-0.5">
              {result.skipped.map((s, i) => {
                const label = subRows.find((sr) => sr.id === s.subRowId)?.label ?? s.subRowId;
                return (
                  <li key={i}>
                    {label} — {s.reason}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New Shift Block" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Section</label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setLocationId('');
            }}
          >
            <option value="">Select a section...</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
            value={locationId}
            disabled={!sectionId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">Select a location...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
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

        {location && (
          <div className="border-t border-slate-200 pt-3 space-y-3">
            <p className="text-xs font-medium text-slate-500">Fill in the rows to create — leave any blank to skip them.</p>
            {subRows.length === 0 && <p className="text-xs text-slate-400">This location has no rows yet.</p>}
            {subRows.map((sr) => {
              const conflict = conflictFor(sr.id);
              return (
                <div key={sr.id} className={`border rounded-md p-3 ${conflict ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">{sr.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{sr.dataType}</span>
                  </div>
                  {conflict ? (
                    <p className="text-xs text-amber-700">Already scheduled at this time — skipped</p>
                  ) : sr.dataType === 'FILE' ? (
                    <input
                      type="file"
                      onChange={(e) => setRowFiles((prev) => ({ ...prev, [sr.id]: e.target.files?.[0] ?? null }))}
                      className="text-xs"
                    />
                  ) : (
                    <CellFieldEditor dataType={sr.dataType} state={rowState(sr.id)} onChange={(next) => setRowState(sr.id, next)} employees={employees} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Shift Block'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
