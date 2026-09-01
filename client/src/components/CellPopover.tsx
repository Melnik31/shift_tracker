import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { CellValue, Employee, Shift, SESSION_TYPES, SubRow } from '../lib/types';
import { toMinutes, fromMinutes } from '../lib/time';
import CellFieldEditor, { CellFieldState, cellFieldStateFromValue, cellFieldPayload } from './CellFieldEditor';

interface Props {
  shift: Shift;
  cellValue: CellValue;
  subRow: SubRow;
  employees: Employee[];
  anchor: { x: number; y: number };
  onClose: () => void;
  onSaved: () => void;
  onDeleteShift: () => void;
}

export default function CellPopover({ shift, cellValue, subRow, employees, anchor, onClose, onSaved, onDeleteShift }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [sessionType, setSessionType] = useState(shift.sessionType ?? '');
  const [cancelled, setCancelled] = useState(shift.cancelled ?? false);
  const [field, setField] = useState<CellFieldState>(() => cellFieldStateFromValue(cellValue));
  const [uploading, setUploading] = useState(false);

  // Changing the start time bumps the end time to exactly one hour later —
  // a fresh default for whoever's setting up the shift, not duration-
  // preserving (adjusting the start again keeps re-defaulting to +1h).
  function handleStartTimeChange(value: string) {
    setStartTime(value);
    setEndTime(fromMinutes(Math.min(toMinutes(value) + 60, 23 * 60 + 59)));
  }

  async function save() {
    if (
      startTime !== shift.startTime ||
      endTime !== shift.endTime ||
      sessionType !== (shift.sessionType ?? '') ||
      cancelled !== (shift.cancelled ?? false)
    ) {
      await api.patch(`/shifts/${shift.id}`, { startTime, endTime, sessionType: sessionType || null, cancelled });
    }
    await api.patch(`/shifts/cells/${cellValue.id}`, cellFieldPayload(subRow.dataType, field));
    onSaved();
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        save().finally(onClose);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime, sessionType, cancelled, field]);

  function handleEnter(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save().finally(onClose);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await api.post(`/shifts/cells/${cellValue.id}/files`, form);
      onSaved();
    } finally {
      setUploading(false);
    }
  }

  async function handleFileDelete(fileId: string) {
    await api.delete(`/shifts/files/${fileId}`);
    onSaved();
  }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: anchor.x, top: anchor.y, zIndex: 50 }}
      className="w-72 bg-white rounded-lg shadow-lg border border-slate-200 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700">{subRow.label}</h4>
        <button
          onClick={() => {
            onDeleteShift();
            onClose();
          }}
          className="text-xs text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">Start</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">End</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-slate-500 mb-1">Session type</label>
        <select
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">—</option>
          {SESSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 mb-3">
        <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.target.checked)} />
        Cancelled — excludes this shift from payable hours
      </label>

      {subRow.dataType !== 'FILE' && (
        <CellFieldEditor dataType={subRow.dataType} state={field} onChange={setField} employees={employees} onKeyDown={handleEnter} autoFocus />
      )}

      {subRow.dataType === 'FILE' && (
        <div>
          <ul className="space-y-1 mb-2">
            {cellValue.fileUploads.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm text-slate-700">
                <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  📎 {f.filename}
                </a>
                <button onClick={() => handleFileDelete(f.id)} className="text-xs text-red-500 hover:underline ml-2">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <input type="file" onChange={handleFileUpload} disabled={uploading} className="text-xs" />
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={() => save().finally(onClose)}
          className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}
