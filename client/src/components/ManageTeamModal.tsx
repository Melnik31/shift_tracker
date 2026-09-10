import { FormEvent, useMemo, useState } from 'react';
import { useEmployees, useEmployeeMutations } from '../hooks/useEmployees';
import { useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { useLayout } from '../hooks/useLayout';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, CAMPUS_SCOPED_ROLES, EMPLOYMENT_TYPES, EmploymentType } from '../lib/types';
import { collectStaffFieldLabels } from '../lib/staffRoles';
import Modal from './Modal';

const STAFF_ROLE_SUGGESTIONS_ID = 'staff-role-suggestions';

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
  const { data: layoutData } = useLayout();

  // Suggests role text that actually matches a real Staff field somewhere in
  // the layout — a role only filters which Staff-assignment checkboxes an
  // employee shows up on (see CellFieldEditor) when it exactly matches a
  // field's label, so keeping the two in sync avoids silent typo mismatches.
  const staffFieldLabels = useMemo(() => [...collectStaffFieldLabels(layoutData?.sections ?? [])].sort(), [layoutData]);
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
  const [newEmploymentType, setNewEmploymentType] = useState<EmploymentType>('PT');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [campusId, setCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Which employment-type tab is showing. `null` until the user picks one
  // explicitly — while null, the tab tracks whichever type actually has
  // coaches (falling back to Part-Time), so a workspace that's all-FT or
  // all-PT doesn't open on an empty list.
  const [manualTab, setManualTab] = useState<EmploymentType | null>(null);
  const employees = data?.employees ?? [];
  const ptCount = employees.filter((e) => e.employmentType === 'PT').length;
  const ftCount = employees.filter((e) => e.employmentType === 'FT').length;
  const activeTab = manualTab ?? (ptCount === 0 && ftCount > 0 ? 'FT' : 'PT');
  const visibleEmployees = useMemo(() => employees.filter((e) => e.employmentType === activeTab), [employees, activeTab]);

  function resetForm() {
    setName('');
    setEmployeeRole('');
    setPin('');
    setNewEmploymentType('PT');
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
        await addEmployee.mutateAsync({
          name,
          role: employeeRole || 'Employee',
          pin,
          employmentType: newEmploymentType,
          ...(matrixCampusId ? { campusId: matrixCampusId } : {}),
        });
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
      <datalist id={STAFF_ROLE_SUGGESTIONS_ID}>
        {staffFieldLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <div className="flex gap-1 mb-3 border-b border-slate-200">
        {EMPLOYMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setManualTab(t)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t === 'FT' ? 'Full-Time' : 'Part-Time'} ({t === 'FT' ? ftCount : ptCount})
          </button>
        ))}
      </div>
      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
        {visibleEmployees.length === 0 && (
          <li className="text-center text-sm text-slate-400 py-4">No {activeTab === 'FT' ? 'full-time' : 'part-time'} coaches yet.</li>
        )}
        {visibleEmployees.map((emp) => (
          <li key={emp.id} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <input
                  className="font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
                  defaultValue={emp.name}
                  onBlur={(e) => e.target.value !== emp.name && updateEmployee.mutate({ id: emp.id, name: e.target.value })}
                />
                <select
                  value={emp.employmentType}
                  onChange={(e) => updateEmployee.mutate({ id: emp.id, employmentType: e.target.value as EmploymentType })}
                  title="Full-Time or Part-Time"
                  className="text-[10px] uppercase tracking-wide text-slate-400 border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-300 rounded flex-shrink-0"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'FT' ? 'Full-Time' : 'Part-Time'}
                    </option>
                  ))}
                </select>
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
                className="block text-xs text-slate-500 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1.5 py-0.5 mt-1"
                defaultValue={emp.role}
                placeholder="+ Add role"
                list={STAFF_ROLE_SUGGESTIONS_ID}
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

        {(canCreateAdmins || accessLevel === 'COACH') && (
          <div className="flex gap-2 mb-2">
            {canCreateAdmins && (
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="COACH">Coach</option>
                {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {accessLevel === 'COACH' && (
              <select
                value={newEmploymentType}
                onChange={(e) => setNewEmploymentType(e.target.value as EmploymentType)}
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'FT' ? 'Full-Time' : 'Part-Time'}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {accessLevel === 'COACH' ? (
          <div className="space-y-2 mb-2">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
            <input
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Role (optional)"
              list={STAFF_ROLE_SUGGESTIONS_ID}
              value={employeeRole}
              onChange={(e) => setEmployeeRole(e.target.value)}
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
