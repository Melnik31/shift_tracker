import { FormEvent, useState } from 'react';
import Modal from './Modal';
import { useMyTimeOffMutations } from '../hooks/useTimeOff';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function RequestTimeOffModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { create } = useMyTimeOffMutations();
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (endDate < startDate) {
      setError('End date must be on or after the start date');
      return;
    }
    try {
      await create.mutateAsync({ startDate, endDate, reason: reason.trim() || undefined });
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Could not send request');
    }
  }

  return (
    <Modal title="Request time off" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              min={todayStr()}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              required
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">Full days, both dates included. Pick the same date twice for a single day.</p>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. Family trip"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
