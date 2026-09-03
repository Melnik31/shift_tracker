import { useState } from 'react';
import Modal from './Modal';
import { useCampuses, useCampusMutations } from '../hooks/useCampuses';
import { Campus } from '../lib/types';

// Same "click to edit, blur to save" pattern as ManageLayoutModal's
// EditableName (not exported from there, so reimplemented here rather than
// reaching into that module for one small component).
function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <input
      className="font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
      defaultValue={value}
      onBlur={(e) => e.target.value.trim() && e.target.value !== value && onSave(e.target.value.trim())}
    />
  );
}

export default function ManageCampusesModal({ onClose }: { onClose: () => void }) {
  const { data } = useCampuses();
  const mutations = useCampusMutations();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await mutations.addCampus.mutateAsync(newName.trim());
      setNewName('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add campus');
    }
  }

  return (
    <Modal title="Manage Campuses" onClose={onClose}>
      <ul className="space-y-2 mb-6 max-h-96 overflow-y-auto">
        {(data?.campuses ?? []).map((campus) => (
          <CampusRow key={campus.id} campus={campus} mutations={mutations} />
        ))}
      </ul>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-sm font-medium text-slate-600 mb-2">Add Campus</h4>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. Hudson, Roseville"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button onClick={onAdd} className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </Modal>
  );
}

function CampusRow({ campus, mutations }: { campus: Campus; mutations: ReturnType<typeof useCampusMutations> }) {
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (err: any) {
      setError(err.message ?? fallback);
    }
  }

  return (
    <li className={`border rounded-md p-3 ${campus.active ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <EditableName value={campus.name} onSave={(name) => run(() => mutations.updateCampus.mutateAsync({ id: campus.id, name }), 'Could not rename campus')} />
          {campus.isDefault && <span className="text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">Default</span>}
          {!campus.active && <span className="text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">Inactive</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!campus.isDefault && (
            <button
              onClick={() => run(() => mutations.setDefaultCampus.mutateAsync(campus.id), 'Could not set default campus')}
              className="text-xs text-slate-500 hover:underline"
            >
              Set Default
            </button>
          )}
          <button
            onClick={() =>
              run(
                () => (campus.active ? mutations.deactivateCampus.mutateAsync(campus.id) : mutations.activateCampus.mutateAsync(campus.id)),
                'Could not update status'
              )
            }
            disabled={campus.isDefault && campus.active}
            title={campus.isDefault && campus.active ? 'Set another campus as default first' : undefined}
            className="text-xs text-red-500 hover:underline disabled:opacity-30 disabled:hover:no-underline"
          >
            {campus.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        {campus.sectionCount} section{campus.sectionCount === 1 ? '' : 's'} · {campus.adminCount} admin{campus.adminCount === 1 ? '' : 's'}
      </p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
}
