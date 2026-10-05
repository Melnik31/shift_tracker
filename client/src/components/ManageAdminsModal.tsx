import { Fragment, useState } from 'react';
import { useAdmins, useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from './ConfirmProvider';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, AdminUserAccount, CAMPUS_SCOPED_ROLES, Campus } from '../lib/types';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, ManageShell, Pill, RowMenu, TH } from './ManageShell';

function isCampusScoped(role: AssignableAdminRole): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(role);
}

// Creating new accounts happens in Manage Team (Coach/Director/SLI/Admin/CEO
// all go through one "Add" form there) — this modal is list + edit email /
// promote/demote (with a required, audited reason) / campus + deactivate.
export default function ManageAdminsModal({ onClose }: { onClose: () => void }) {
  const { data } = useAdmins();
  const { data: campusData } = useCampuses();
  const { data: me } = useAuth();
  const mutations = useAdminMutations();
  const confirm = useConfirm();
  const campuses = (campusData?.campuses ?? []).filter((c) => c.active);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const admins = (data?.admins ?? []).filter((a) => !q || a.email.toLowerCase().includes(q) || (a.name ?? '').toLowerCase().includes(q));

  async function toggleActive(admin: AdminUserAccount) {
    setError(null);
    if (
      admin.active &&
      !(await confirm({
        title: `Deactivate ${admin.email}?`,
        message: 'They will no longer be able to sign in. You can reactivate the account later.',
        confirmLabel: 'Deactivate',
      }))
    )
      return;
    try {
      if (admin.active) await mutations.deactivateAdmin.mutateAsync(admin.id);
      else await mutations.activateAdmin.mutateAsync(admin.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not update status');
    }
  }

  return (
    <ManageShell title="Manage Admins" onClose={onClose}>
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search admins..."
          className={`${INPUT} w-full pl-9 py-2`}
        />
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${TH} rounded-tl-lg`}>Admin</th>
              <th className={TH}>Role</th>
              <th className={TH}>Campus</th>
              <th className={`${TH} w-12 rounded-tr-lg`}></th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-sm text-slate-400 py-6">
                  No admins{search ? ' match your search' : ' yet'}.
                </td>
              </tr>
            )}
            {admins.map((admin) => {
              const isSelf = admin.id === me?.admin?.id;
              return (
                <Fragment key={admin.id}>
                  <tr className={`border-t border-slate-100 ${admin.active ? '' : 'bg-slate-50 text-slate-400'} ${editingId === admin.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${admin.active ? 'text-slate-800' : ''}`}>{admin.email}</span>
                        {isSelf && <Pill>You</Pill>}
                        {admin.mustChangePassword && <Pill tone="amber">Temp password</Pill>}
                        {!admin.active && <Pill>Inactive</Pill>}
                      </div>
                      {admin.name && <p className="text-xs text-slate-400">{admin.name}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone="blue">{admin.role}</Pill>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{admin.campus?.name ?? (isCampusScoped(admin.role) ? '—' : 'All campuses')}</td>
                    <td className="px-3 py-2 text-right">
                      <RowMenu
                        items={[
                          {
                            label: 'Edit',
                            onClick: () => {
                              setError(null);
                              setEditingId(admin.id);
                            },
                          },
                          {
                            label: admin.active ? 'Deactivate' : 'Reactivate',
                            onClick: () => toggleActive(admin),
                            disabled: isSelf,
                            title: isSelf ? "You can't deactivate your own account" : undefined,
                            destructive: admin.active,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  {editingId === admin.id && (
                    <tr className="bg-blue-50">
                      <td colSpan={4} className="px-3 pb-4">
                        <EditAdminForm
                          admin={admin}
                          campuses={campuses}
                          isSelf={isSelf}
                          mutations={mutations}
                          onDone={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </ManageShell>
  );
}

function EditAdminForm({
  admin,
  campuses,
  isSelf,
  mutations,
  onDone,
}: {
  admin: AdminUserAccount;
  campuses: Campus[];
  isSelf: boolean;
  mutations: ReturnType<typeof useAdminMutations>;
  onDone: () => void;
}) {
  const [email, setEmail] = useState(admin.email);
  const [role, setRole] = useState<AssignableAdminRole>(admin.role);
  const [campusId, setCampusId] = useState(admin.campus?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const roleChanged = role !== admin.role;
  const scoped = isCampusScoped(role);

  async function save() {
    const nextEmail = email.trim();
    if (!nextEmail) return setError('Email is required');
    if (roleChanged && !reason.trim()) return setError('A reason is required to change role');
    if (scoped && !campusId) return setError('Select a campus for this role');
    setError(null);
    setSaving(true);
    try {
      if (nextEmail !== admin.email) await mutations.updateAdmin.mutateAsync({ id: admin.id, email: nextEmail });
      if (roleChanged) {
        await mutations.changeRole.mutateAsync({
          id: admin.id,
          newRole: role,
          ...(scoped ? { campusId } : {}),
          reason: reason.trim(),
        });
      } else if (scoped && campusId !== (admin.campus?.id ?? '')) {
        await mutations.updateAdmin.mutateAsync({ id: admin.id, campusId });
      }
      onDone();
    } catch (err: any) {
      setError(err.message ?? 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Email</span>
          <input className={`${INPUT} w-full`} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Role</span>
          <select
            value={role}
            disabled={isSelf}
            title={isSelf ? "You can't change your own role" : undefined}
            onChange={(e) => setRole(e.target.value as AssignableAdminRole)}
            className={`${INPUT} w-full disabled:opacity-50`}
          >
            {ASSIGNABLE_ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {scoped && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Campus</span>
            <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className={`${INPUT} w-full`}>
              <option value="">Select campus…</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {roleChanged && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Reason for role change</span>
            <input autoFocus className={`${INPUT} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className={BTN_PRIMARY}>
          Save
        </button>
        <button onClick={onDone} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    </div>
  );
}
