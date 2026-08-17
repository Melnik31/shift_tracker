import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { CellValue, Employee, Shift, StatusValue, STATUS_VALUES, SubRow } from '../lib/types';
import { toMinutes, fromMinutes } from '../lib/time';

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

const BADGE_COLORS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#64748b'];

export default function CellPopover({ shift, cellValue, subRow, employees, anchor, onClose, onSaved, onDeleteShift }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [textValue, setTextValue] = useState(cellValue.textValue ?? '');
  const [badgeLabel, setBadgeLabel] = useState(cellValue.badgeLabel ?? '');
  const [badgeColor, setBadgeColor] = useState(cellValue.badgeColor ?? BADGE_COLORS[0]);
  const [statusValue, setStatusValue] = useState<StatusValue | ''>(cellValue.statusValue ?? '');
  const [linkUrl, setLinkUrl] = useState(cellValue.linkUrl ?? '');
  const [staffIds, setStaffIds] = useState<string[]>(cellValue.staffAssignments.map((a) => a.employee.id));
  const [uploading, setUploading] = useState(false);

  // Changing the start time bumps the end time to exactly one hour later —
  // a fresh default for whoever's setting up the shift, not duration-
  // preserving (adjusting the start again keeps re-defaulting to +1h).
  function handleStartTimeChange(value: string) {
    setStartTime(value);
    setEndTime(fromMinutes(Math.min(toMinutes(value) + 60, 23 * 60 + 59)));
  }

  async function save() {
    if (startTime !== shift.startTime || endTime !== shift.endTime) {
      await api.patch(`/shifts/${shift.id}`, { startTime, endTime });
    }
    const payload: Record<string, unknown> = {};
    if (subRow.dataType === 'TEXT') payload.textValue = textValue;
    if (subRow.dataType === 'BADGE') {
      payload.badgeLabel = badgeLabel;
      payload.badgeColor = badgeColor;
    }
    if (subRow.dataType === 'STATUS') payload.statusValue = statusValue || null;
    if (subRow.dataType === 'LINK') {
      payload.linkUrl = linkUrl;
      payload.textValue = textValue; // reused as the link's display label (e.g. a drill name)
    }
    if (subRow.dataType === 'STAFF') payload.staffEmployeeIds = staffIds;

    await api.patch(`/shifts/cells/${cellValue.id}`, payload);
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
  }, [startTime, endTime, textValue, badgeLabel, badgeColor, statusValue, linkUrl, staffIds]);

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

      {subRow.dataType === 'TEXT' && (
        <textarea
          autoFocus
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={handleEnter}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="e.g. Setup notes, post instructions..."
        />
      )}

      {subRow.dataType === 'BADGE' && (
        <div>
          <input
            autoFocus
            value={badgeLabel}
            onChange={(e) => setBadgeLabel(e.target.value)}
            onKeyDown={handleEnter}
            className="w-full mb-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. High, Headliner"
          />
          <div className="flex gap-1.5">
            {BADGE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBadgeColor(c)}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 ${badgeColor === c ? 'border-slate-900' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>
      )}

      {subRow.dataType === 'STATUS' && (
        <select
          autoFocus
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value as StatusValue)}
          onKeyDown={handleEnter}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">—</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      )}

      {subRow.dataType === 'LINK' && (
        <div className="space-y-2">
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={handleEnter}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Link label, e.g. Change of Angle"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleEnter}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="https://... or #drill/..."
          />
        </div>
      )}

      {subRow.dataType === 'STAFF' && (
        <div className="max-h-36 overflow-y-auto space-y-1">
          {employees.map((emp) => (
            <label key={emp.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={staffIds.includes(emp.id)}
                onChange={(e) => setStaffIds(e.target.checked ? [...staffIds, emp.id] : staffIds.filter((id) => id !== emp.id))}
              />
              {emp.name}
            </label>
          ))}
        </div>
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
