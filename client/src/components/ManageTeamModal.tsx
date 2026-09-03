import { FormEvent, useState } from 'react';
import { useEmployees, useEmployeeMutations } from '../hooks/useEmployees';
import { useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, CAMPUS_SCOPED_ROLES } from '../lib/types';
import Modal from './Modal';

// Coach uses the existing PIN flow (Employee record). Director/SLI/Admin/CEO
// use a new email + temp-password flow (AdminUser record, forced to change
// that password on first login — see routes/auth.ts). Distinct from the
// Coach path's free-text "Role (optional)" field below, which is just an
// Employee job title (e.g. "Guard") — unrelated to this access-level choice.
type AccessLevel = 'COACH' | AssignableAdminRole;

function isCampusScoped(level: AccessLevel): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(level);
}

// matrixCampusId mirrors whatever the Matrix's Campus selector is currently
// set to (same prop ManageLayoutModal takes as `campusId`, renamed here to
// avoid colliding with the "which campus to assign a new Director/SLI"
// local state below): the roster narrows to that campus (plus floating
// employees), and a new Coach silently lands there. A restricted Director/
// SLI always gets their own campus regardless (enforced server-side), so
// they never see a picker either way.
export default function ManageTeamModal({ onClose, campusId: matrixCampusId }: { onClose: () => void; campusId: string | null }) {
  const { data } = useEmployees(matrixCampusId);
  const { addEmployee, updateEmployee, deleteEmployee } = useEmployeeMutations();
  const { addAdmin } = useAdminMutations();
  const { data: campusData } = useCampuses();
  const { data: me } = useAuth();
  // A Director/SLI can already open Manage Team, but creating Director/SLI/
  // Admin/CEO accounts — and reassigning an Employee's campus — is
  // server-side ADMIN/CEO-only; hide those controls for anyone who'd just
  // hit a 400/404 on submit.
  const canManageCampusAssignment = me?.admin?.role === 'ADMIN' || me?.admin?.role === 'CEO';
  const canCreateAdmins = canManageCampusAssignment;
  const allCampuses = campusData?.campuses ?? [];
  const campuses = allCampuses.filter((c) => c.active);

  const [accessLevel, setAccessLevel] = useState<AccessLevel>('COACH');
  const [name, setName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [campusId, setCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName('');
    setEmployeeRole('');
    setPin('');
    setEmail('');
    setTempPassword('');
    setCampusId('');
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (accessLevel === 'COACH') {
      if (!/^\d{4}$/.test(pin)) {
        setError('PIN must be exactly 4 digits');
        return;
      }
      try {
        await addEmployee.mutateAsync({ name, role: employeeRole || 'Employee', pin, ...(matrixCampusId ? { campusId: matrixCampusId } : {}) });
        resetForm();
      } catch (err: any) {
        setError(err.message ?? 'Could not add employee');
      }
      return;
    }

    if (isCampusScoped(accessLevel) && !campusId) {
      setError('Choose a campus for this role');
      return;
    }
    try {
      await addAdmin.mutateAsync({
        name: name.trim() || undefined,
        email,
        password: tempPassword,
        role: accessLevel,
        ...(isCampusScoped(accessLevel) ? { campusId } : {}),
      });
      resetForm();
    } catch (err: any) {
      setError(err.message ?? 'Could not add admin');
    }
  }

  return (
    <Modal title="Manage Team" onClose={onClose}>
      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
        {(data?.employees ?? []).map((emp) => (
          <li key={emp.id} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <input
                  className="font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
                  defaultValue={emp.name}
                  onBlur={(e) => e.target.value !== emp.name && updateEmployee.mutate({ id: emp.id, name: e.target.value })}
                />
                {allCampuses.length > 1 &&
                  (canManageCampusAssignment ? (
                    <select
                      value={emp.campusId ?? ''}
                      onChange={(e) => updateEmployee.mutate({ id: emp.id, campusId: e.target.value || null })}
                      title="Move this employee to a different campus, or make them float across every campus"
                      className="text-[10px] uppercase tracking-wide text-slate-400 border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-300 rounded flex-shrink-0"
                    >
                      <option value="">Floating (all campuses)</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 flex-shrink-0">{emp.campus?.name ?? 'Floating'}</span>
                  ))}
              </div>
              <input
                className="block text-xs text-slate-500 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
                defaultValue={emp.role}
                onBlur={(e) => e.target.value !== emp.role && updateEmployee.mutate({ id: emp.id, role: e.target.value })}
              />
            </div>
            <button onClick={() => deleteEmployee.mutate(emp.id)} className="text-xs text-red-500 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} className="border-t border-slate-200 pt-4">
        <h4 className="text-sm font-medium text-slate-600 mb-2">{accessLevel === 'COACH' ? 'Add Employee' : 'Add Admin'}</h4>

        {canCreateAdmins && (
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
            className="w-full mb-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="COACH">Coach</option>
            {ASSIGNABLE_ADMIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}

        {accessLevel === 'COACH' ? (
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Role (optional)"
              value={employeeRole}
              onChange={(e) => setEmployeeRole(e.target.value)}
            />
            <input
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="PIN"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </div>
        ) : (
          <div className="space-y-2 mb-2">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                type="email"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Temp password"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                required
              />
              {isCampusScoped(accessLevel) && (
                <select
                  value={campusId}
                  onChange={(e) => setCampusId(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
          </div>
        )}

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button type="submit" className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
          Add
        </button>
      </form>
    </Modal>
  );
}
