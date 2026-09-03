import { useState } from 'react';
import Modal from './Modal';
import { useAdmins, useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, AdminUserAccount, CAMPUS_SCOPED_ROLES, Campus } from '../lib/types';

function isCampusScoped(role: AssignableAdminRole): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(role);
}

// Creating new accounts happens in Manage Team now (Coach/Director/SLI/
// Admin/CEO all go through one "Add" form there) — this modal is purely
// list + promote/demote (with a required, audited reason) + deactivate.
export default function ManageAdminsModal({ onClose }: { onClose: () => void }) {
  const { data } = useAdmins();
  const { data: campusData } = useCampuses();
  const { data: me } = useAuth();
  const mutations = useAdminMutations();
  const campuses = (campusData?.campuses ?? []).filter((c) => c.active);

  return (
    <Modal title="Manage Admins" onClose={onClose}>
      <ul className="space-y-2 mb-6 max-h-96 overflow-y-auto">
        {(data?.admins ?? []).map((admin) => (
          <AdminRow key={admin.id} admin={admin} campuses={campuses} isSelf={admin.id === me?.admin?.id} mutations={mutations} />
        ))}
      </ul>
    </Modal>
  );
}

function AdminRow({
  admin,
  campuses,
  isSelf,
  mutations,
}: {
  admin: AdminUserAccount;
  campuses: Campus[];
  isSelf: boolean;
  mutations: ReturnType<typeof useAdminMutations>;
}) {
  const [pendingRole, setPendingRole] = useState<AssignableAdminRole>(admin.role);
  const [campusId, setCampusId] = useState(admin.campus?.id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const roleChanged = pendingRole !== admin.role;

  async function saveCampusOnly(nextCampusId: string) {
    setError(null);
    try {
      await mutations.updateAdmin.mutateAsync({ id: admin.id, campusId: nextCampusId });
    } catch (err: any) {
      setError(err.message ?? 'Could not update campus');
    }
  }

  async function saveRoleChange() {
    if (!reason.trim()) {
      setError('A reason is required to change role');
      return;
    }
    setError(null);
    try {
      await mutations.changeRole.mutateAsync({
        id: admin.id,
        newRole: pendingRole,
        ...(isCampusScoped(pendingRole) ? { campusId } : {}),
        reason: reason.trim(),
      });
      setReason('');
    } catch (err: any) {
      setError(err.message ?? 'Could not change role');
    }
  }

  function cancelRoleChange() {
    setPendingRole(admin.role);
    setCampusId(admin.campus?.id ?? '');
    setReason('');
    setError(null);
  }

  async function saveEmail(email: string) {
    if (!email.trim() || email === admin.email) return;
    setError(null);
    try {
      await mutations.updateAdmin.mutateAsync({ id: admin.id, email: email.trim() });
    } catch (err: any) {
      setError(err.message ?? 'Could not update email');
    }
  }

  async function toggleActive() {
    setError(null);
    try {
      if (admin.active) await mutations.deactivateAdmin.mutateAsync(admin.id);
      else await mutations.activateAdmin.mutateAsync(admin.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not update status');
    }
  }

  return (
    <li className={`border rounded-md p-3 ${admin.active ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <input
            className="w-full font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
            defaultValue={admin.email}
            onBlur={(e) => saveEmail(e.target.value)}
          />
          {admin.name && <p className="text-xs text-slate-400 px-1">{admin.name}</p>}
        </div>
        {admin.mustChangePassword && (
          <span className="text-[10px] uppercase tracking-wide text-amber-600 flex-shrink-0">Temp password</span>
        )}
        {!admin.active && <span className="text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">Inactive</span>}
        <button
          onClick={toggleActive}
          disabled={isSelf}
          title={isSelf ? "You can't deactivate your own account" : undefined}
          className="text-xs text-red-500 hover:underline disabled:opacity-30 disabled:hover:no-underline flex-shrink-0"
        >
          {admin.active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={pendingRole}
          disabled={isSelf}
          title={isSelf ? "You can't change your own role" : undefined}
          onChange={(e) => setPendingRole(e.target.value as AssignableAdminRole)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
        >
          {ASSIGNABLE_ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {isCampusScoped(pendingRole) && (
          <select
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value);
              if (!roleChanged && e.target.value) saveCampusOnly(e.target.value);
            }}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Select campus…</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {roleChanged && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            placeholder="Reason for role change"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="button" onClick={saveRoleChange} className="rounded-md bg-slate-900 text-white px-3 py-1 text-sm font-medium hover:bg-slate-700">
            Save
          </button>
          <button type="button" onClick={cancelRoleChange} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
}
