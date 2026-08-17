import { useState } from 'react';
import { useLayout } from '../hooks/useLayout';
import { useShiftMutations } from '../hooks/useShifts';
import Modal from './Modal';

export default function AddShiftModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: layout } = useLayout();
  const { addShift } = useShiftMutations(date);

  const sections = layout?.sections ?? [];
  const [sectionId, setSectionId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [subRowId, setSubRowId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [error, setError] = useState<string | null>(null);

  const section = sections.find((s) => s.id === sectionId);
  const locations = section?.locations ?? [];
  const location = locations.find((l) => l.id === locationId);
  const subRows = location?.subRows ?? [];

  async function handleSubmit() {
    setError(null);
    if (!subRowId) {
      setError('Choose a section, location, and sub-row first');
      return;
    }
    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }
    await addShift.mutateAsync({ subRowId, date, startTime, endTime });
    onClose();
  }

  return (
    <Modal title={`Add Shift — ${date}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Section</label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setLocationId('');
              setSubRowId('');
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
            onChange={(e) => {
              setLocationId(e.target.value);
              setSubRowId('');
            }}
          >
            <option value="">Select a location...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Sub-Row</label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
            value={subRowId}
            disabled={!locationId}
            onChange={(e) => setSubRowId(e.target.value)}
          >
            <option value="">Select a sub-row...</option>
            {subRows.map((sr) => (
              <option key={sr.id} value={sr.id}>
                {sr.label} ({sr.dataType})
              </option>
            ))}
          </select>
        </div>

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

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end pt-2">
          <button onClick={handleSubmit} className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
            Add Shift
          </button>
        </div>
      </div>
    </Modal>
  );
}
