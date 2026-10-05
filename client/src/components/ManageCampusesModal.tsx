import { useState } from 'react';
import { useCampuses, useCampusMutations } from '../hooks/useCampuses';
import { Campus } from '../lib/types';
import { useConfirm } from './ConfirmProvider';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, ManageShell, Pill, RowMenu, TH } from './ManageShell';

export default function ManageCampusesModal({ onClose }: { onClose: () => void }) {
  const { data } = useCampuses();
  const mutations = useCampusMutations();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const campuses = data?.campuses ?? [];

  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err: any) {
      setError(err.message ?? fallback);
      return false;
    }
  }

  async function onAdd() {
    if (!newName.trim()) return;
    if (await run(() => mutations.addCampus.mutateAsync(newName.trim()), 'Could not add campus')) {
      setNewName('');
      setAdding(false);
    }
  }

  async function onRename(campus: Campus) {
    const name = editName.trim();
    if (!name) return;
    if (name === campus.name || (await run(() => mutations.updateCampus.mutateAsync({ id: campus.id, name }), 'Could not rename campus'))) {
      setEditingId(null);
    }
  }

  async function toggleActive(campus: Campus) {
    if (
      campus.active &&
      !(await confirm({
        title: `Deactivate "${campus.name}"?`,
        message: 'Its sections and admins are kept, but the campus is hidden from selectors until reactivated.',
        confirmLabel: 'Deactivate',
      }))
    )
      return;
    run(
      () => (campus.active ? mutations.deactivateCampus.mutateAsync(campus.id) : mutations.activateCampus.mutateAsync(campus.id)),
      'Could not update status'
    );
  }

  return (
    <ManageShell
      title="Manage Campuses"
      onClose={onClose}
      action={
        <button onClick={() => setAdding((v) => !v)} className={BTN_PRIMARY}>
          + Add campus
        </button>
      }
    >
      {adding && (
        <div className="flex gap-2 mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            autoFocus
            className={`${INPUT} flex-1`}
            placeholder="e.g. Hudson, Roseville"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          />
          <button onClick={onAdd} disabled={!newName.trim()} className={BTN_PRIMARY}>
            Save
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setNewName('');
              setError(null);
            }}
            className={BTN_SECONDARY}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 rounded-t-lg">
              <th className={`${TH} rounded-tl-lg`}>Campus</th>
              <th className={TH}>Sections</th>
              <th className={TH}>Admins</th>
              <th className={`${TH} w-12 rounded-tr-lg`}></th>
            </tr>
          </thead>
          <tbody>
            {campuses.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-sm text-slate-400 py-6">
                  No campuses yet.
                </td>
              </tr>
            )}
            {campuses.map((campus) => (
              <tr key={campus.id} className={`border-t border-slate-100 ${campus.active ? '' : 'bg-slate-50 text-slate-400'}`}>
                <td className="px-3 py-3">
                  {editingId === campus.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className={`${INPUT} flex-1 min-w-0 py-1`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onRename(campus);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <button onClick={() => onRename(campus)} disabled={!editName.trim()} className={`${BTN_PRIMARY} py-1`}>
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className={`${BTN_SECONDARY} py-1`}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-medium ${campus.active ? 'text-slate-800' : ''}`}>{campus.name}</span>
                      {campus.isDefault && <Pill tone="blue">Default</Pill>}
                      {!campus.active && <Pill>Inactive</Pill>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-600">{campus.sectionCount}</td>
                <td className="px-3 py-3 text-slate-600">{campus.adminCount}</td>
                <td className="px-3 py-2 text-right">
                  <RowMenu
                    items={[
                      {
                        label: 'Rename',
                        onClick: () => {
                          setError(null);
                          setEditName(campus.name);
                          setEditingId(campus.id);
                        },
                      },
                      ...(campus.isDefault
                        ? []
                        : [
                            {
                              label: 'Set as default',
                              onClick: () => run(() => mutations.setDefaultCampus.mutateAsync(campus.id), 'Could not set default campus'),
                            },
                          ]),
                      {
                        label: campus.active ? 'Deactivate' : 'Reactivate',
                        onClick: () => toggleActive(campus),
                        disabled: campus.isDefault && campus.active,
                        title: campus.isDefault && campus.active ? 'Set another campus as default first' : undefined,
                        destructive: campus.active,
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ManageShell>
  );
}
