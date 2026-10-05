import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from './ConfirmProvider';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, ManageShell } from './ManageShell';

const CODE_RULE = /^[A-Za-z0-9]{3,16}$/;

export default function ManageWorkspaceModal({ onClose }: { onClose: () => void }) {
  const { data: me } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const savedName = me?.workspace.name ?? '';
  const savedCode = me?.workspace.workspaceCode ?? '';
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(savedCode);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameChanged = name.trim() !== savedName;
  const codeChanged = code.trim() !== savedCode;
  const dirty = nameChanged || codeChanged;

  async function save() {
    const nextName = name.trim();
    const nextCode = code.trim();
    setSaved(false);
    if (!nextName) return setError('Workspace name is required');
    if (codeChanged && !CODE_RULE.test(nextCode)) return setError('Workspace code must be 3-16 letters or numbers, with no spaces or hyphens');
    if (
      codeChanged &&
      !(await confirm({
        title: `Change the workspace code to ${nextCode}?`,
        message: `Everyone signs in with the workspace code. ${savedCode} stops working right away, so tell your team the new code. People who are signed in now stay signed in.`,
        confirmLabel: 'Change code',
      }))
    )
      return;
    setError(null);
    setSaving(true);
    try {
      await api.patch('/layout/workspace', {
        ...(nameChanged ? { name: nextName } : {}),
        ...(codeChanged ? { workspaceCode: nextCode } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setName(nextName);
      setCode(nextCode);
      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? 'Could not save workspace settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ManageShell title="Workspace Settings" subtitle={savedName} onClose={onClose}>
      <div className="max-w-md space-y-5">
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Workspace name</span>
          <input
            id="workspace-name"
            className={`${INPUT} w-full`}
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          <span className="block text-xs text-slate-400 mt-1">Shown in the header on every screen.</span>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Workspace code</span>
          <input
            id="workspace-code"
            className={`${INPUT} w-full`}
            value={code}
            maxLength={16}
            onChange={(e) => {
              setCode(e.target.value);
              setSaved(false);
            }}
          />
          <span className="block text-xs text-slate-400 mt-1">What your team types to sign in. 3 to 16 letters or numbers. Changing it means everyone needs the new code.</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !dirty && <p className="text-sm text-emerald-700">Saved.</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={!dirty || saving} className={BTN_PRIMARY}>
            Save changes
          </button>
          <button
            onClick={() => {
              setName(savedName);
              setCode(savedCode);
              setError(null);
            }}
            disabled={!dirty}
            className={`${BTN_SECONDARY} disabled:opacity-40`}
          >
            Cancel
          </button>
        </div>
      </div>
    </ManageShell>
  );
}
