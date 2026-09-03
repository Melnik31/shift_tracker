import { FormEvent, useState } from 'react';
import Modal from './Modal';
import { useAdmins, useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, AdminUserAccount, CAMPUS_SCOPED_ROLES, Campus } from '../lib/types';

function isCampusScoped(role: AssignableAdminRole): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(role);
}

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

      <AddAdminForm campuses={campuses} />
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
  const [role, setRole] = useState<AssignableAdminRole>(admin.role);
  const [campusId, setCampusId] = useState(admin.campus?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function saveRoleAndCampus(nextRole: AssignableAdminRole, nextCampusId: string) {
    setError(null);
    try {
      await mutations.updateAdmin.mutateAsync({
        id: admin.id,
        role: nextRole,
        ...(isCampusScoped(nextRole) ? { campusId: nextCampusId } : {}),
      });
    } catch (err: any) {
      setError(err.message ?? 'Could not update admin');
    }
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
        <input
          className="flex-1 min-w-0 font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
          defaultValue={admin.email}
          onBlur={(e) => saveEmail(e.target.value)}
        />
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
          value={role}
          onChange={(e) => {
            const nextRole = e.target.value as AssignableAdminRole;
            setRole(nextRole);
            if (!isCampusScoped(nextRole)) saveRoleAndCampus(nextRole, campusId);
          }}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {ASSIGNABLE_ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {isCampusScoped(role) && (
          <select
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value);
              if (e.target.value) saveRoleAndCampus(role, e.target.value);
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
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </li>
  );
}

function AddAdminForm({ campuses }: { campuses: Campus[] }) {
  const { addAdmin } = useAdminMutations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AssignableAdminRole>('DIRECTOR');
  const [campusId, setCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isCampusScoped(role) && !campusId) {
      setError('Choose a campus for this role');
      return;
    }
    try {
      await addAdmin.mutateAsync({ email, password, role, ...(isCampusScoped(role) ? { campusId } : {}) });
      setEmail('');
      setPassword('');
      setCampusId('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add admin');
    }
  }

  return (
    <form onSubmit={onAdd} className="border-t border-slate-200 pt-4 space-y-2">
      <h4 className="text-sm font-medium text-slate-600 mb-2">Add Admin</h4>
      <div className="flex gap-2">
        <input
          type="email"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Initial password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AssignableAdminRole)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {ASSIGNABLE_ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {isCampusScoped(role) && (
          <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Select campus…</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
        Add
      </button>
    </form>
  );
}
