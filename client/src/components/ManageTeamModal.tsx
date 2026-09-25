import { FormEvent, useMemo, useState } from 'react';
import { useEmployees, useEmployeeMutations } from '../hooks/useEmployees';
import { useAdminMutations } from '../hooks/useAdmins';
import { useCampuses } from '../hooks/useCampuses';
import { useAuth } from '../hooks/useAuth';
import { useLayout } from '../hooks/useLayout';
import { ASSIGNABLE_ADMIN_ROLES, AssignableAdminRole, CAMPUS_SCOPED_ROLES, Employee, EMPLOYMENT_TYPES, EmploymentType } from '../lib/types';
import { collectStaffFieldLabels } from '../lib/staffRoles';
import Modal from './Modal';

const STAFF_ROLE_SUGGESTIONS_ID = 'staff-role-suggestions';

// Coach uses the existing PIN flow (Employee record). Director/SLI/Admin/CEO
// use a new email + temp-password flow (AdminUser record, forced to change
// that password on first login — see routes/auth.ts). Distinct from the
// Coach path's free-text roles below, which are just Employee job titles
// (e.g. "Guard") — unrelated to this access-level choice.
type AccessLevel = 'COACH' | AssignableAdminRole;

function isCampusScoped(level: AccessLevel): boolean {
  return (CAMPUS_SCOPED_ROLES as readonly string[]).includes(level);
}

function campusLabel(campuses: { id: string; name: string }[]): string {
  return campuses.length === 0 ? 'All campuses' : campuses.map((c) => c.name).join(', ');
}

// A masked text/password input with a Show/Hide toggle — this codebase has
// no icon library, so the toggle is a plain text link, matching the app's
// existing symbol+text button convention (e.g. the "✕ Remove role" button
// below). Used for a PIN (numeric, 4 digits) or a temp password (free text).
function SecretField({
  value,
  onChange,
  placeholder,
  numeric,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        inputMode={numeric ? 'numeric' : undefined}
        maxLength={numeric ? 4 : undefined}
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-12 text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-400 hover:text-slate-600"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

// "All campuses" (selected: []) vs "Selected campuses" (a specific list) as
// two radios — the latter reveals a checkbox per Campus. `uiMode` is local,
// separate from `selected`, so picking "Selected campuses" before checking
// any box doesn't immediately look identical to "All campuses" again (an
// empty `selected` is genuinely ambiguous between the two intents; the radio
// choice itself is what disambiguates it for the admin while editing).
function CampusAssignmentField({
  allCampuses,
  selected,
  onChange,
}: {
  allCampuses: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [uiMode, setUiMode] = useState<'all' | 'selected'>(selected.length === 0 ? 'all' : 'selected');

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="radio"
          className="mt-1 accent-blue-600"
          checked={uiMode === 'all'}
          onChange={() => {
            setUiMode('all');
            onChange([]);
          }}
        />
        <span>
          <span className="block text-sm font-medium text-slate-800">All campuses</span>
          <span className="block text-xs text-slate-500">Employee can be assigned to and manage all campuses.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="radio" className="mt-1 accent-blue-600" checked={uiMode === 'selected'} onChange={() => setUiMode('selected')} />
        <span>
          <span className="block text-sm font-medium text-slate-800">Selected campuses</span>
          <span className="block text-xs text-slate-500">Employee can only be assigned to the selected campuses.</span>
        </span>
      </label>
      {uiMode === 'selected' && (
        <div className="ml-6 space-y-1.5">
          {allCampuses.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="accent-blue-600"
                checked={selected.includes(c.id)}
                onChange={(e) => onChange(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// A removable-chip list of job-title roles, plus a persistent text input
// (with the same known-Staff-field datalist suggestions role inputs have
// always had) that appends a new role on Enter or on blur.
function RoleChipInput({ roles, onChange, placeholder }: { roles: string[]; onChange: (next: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const next = draft.trim();
    if (next && !roles.includes(next)) onChange([...roles, next]);
    setDraft('');
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1.5 min-h-[38px]">
      {roles.map((r) => (
        <span key={r} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
          {r}
          <button
            type="button"
            title="Remove role"
            onClick={() => onChange(roles.filter((x) => x !== r))}
            className="text-slate-400 hover:text-red-500 leading-none"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[7rem] text-sm border-none focus:outline-none"
        placeholder={roles.length === 0 ? placeholder ?? 'Select roles' : '+ Add role'}
        list={STAFF_ROLE_SUGGESTIONS_ID}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
      <h4 className="text-sm font-semibold text-slate-800 mb-3">{title}</h4>
      {children}
    </div>
  );
}

// matrixCampusId mirrors whatever the Matrix's Campus selector is currently
// set to (same prop ManageLayoutModal takes as `campusId`, renamed here to
// avoid colliding with the "which campus to assign a new Director/SLI"
// local state below): the roster narrows to that campus (plus floating
// employees), and a new Coach's campus picker defaults there. A restricted
// Director/SLI always gets their own campus regardless (enforced
// server-side), so they never see a picker either way.
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
  // Admin/CEO accounts — and reassigning an Employee's campuses — is
  // server-side ADMIN/CEO-only; hide those controls for anyone who'd just
  // hit a 400/404 on submit.
  const canManageCampusAssignment = me?.admin?.role === 'ADMIN' || me?.admin?.role === 'CEO';
  const canCreateAdmins = canManageCampusAssignment;
  const allCampuses = campusData?.campuses ?? [];
  const campuses = allCampuses.filter((c) => c.active);
  const employees = data?.employees ?? [];

  // ── List view state ──────────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'form'>('list');
  const [manualTab, setManualTab] = useState<EmploymentType | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const ptCount = employees.filter((e) => e.employmentType === 'PT').length;
  const ftCount = employees.filter((e) => e.employmentType === 'FT').length;
  const activeTab = manualTab ?? (ptCount === 0 && ftCount > 0 ? 'FT' : 'PT');
  const tabEmployees = useMemo(() => employees.filter((e) => e.employmentType === activeTab), [employees, activeTab]);
  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? tabEmployees.filter((e) => e.name.toLowerCase().includes(term)) : tabEmployees;
  }, [tabEmployees, search]);

  function selectTab(t: EmploymentType) {
    setManualTab(t);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Add form state ───────────────────────────────────────────────────
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('COACH');
  const [name, setName] = useState('');
  const [employeeRoles, setEmployeeRoles] = useState<string[]>([]);
  const [newEmployeeCampusIds, setNewEmployeeCampusIds] = useState<string[]>(matrixCampusId ? [matrixCampusId] : []);
  const [pin, setPin] = useState('');
  const [newEmploymentType, setNewEmploymentType] = useState<EmploymentType>('PT');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [campusId, setCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Edit form state (single or bulk) ─────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]); // single: the employee's current roles; bulk: roles to ADD to every selected employee
  const [editCampusIds, setEditCampusIds] = useState<string[]>([]);
  const [editEmploymentType, setEditEmploymentType] = useState<EmploymentType>('PT');
  const [campusTouched, setCampusTouched] = useState(false); // bulk mode only: was Campus assignment actually changed, or should it stay untouched per-employee?
  const [employmentTypeTouched, setEmploymentTypeTouched] = useState(false); // bulk mode only, same reasoning
  const [resettingPin, setResettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');

  function resetAddForm() {
    setAccessLevel('COACH');
    setName('');
    setEmployeeRoles([]);
    setNewEmployeeCampusIds(matrixCampusId ? [matrixCampusId] : []);
    setPin('');
    setNewEmploymentType('PT');
    setEmail('');
    setTempPassword('');
    setCampusId('');
    setError(null);
  }

  function openAdd() {
    resetAddForm();
    setFormMode('add');
    setView('form');
  }

  function openEdit() {
    setError(null);
    setResettingPin(false);
    setNewPin('');
    setCampusTouched(false);
    setEmploymentTypeTouched(false);
    if (selectedIds.size === 1) {
      const emp = employees.find((e) => selectedIds.has(e.id));
      if (emp) {
        setEditName(emp.name);
        setEditRoles(emp.roles);
        setEditCampusIds(emp.campuses.map((c) => c.id));
        setEditEmploymentType(emp.employmentType);
      }
    } else {
      setEditName('');
      setEditRoles([]);
      setEditCampusIds([]);
      setEditEmploymentType('PT');
    }
    setFormMode('edit');
    setView('form');
  }

  function backToList() {
    setView('list');
    setError(null);
  }

  async function onSubmitAdd(e: FormEvent) {
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
          roles: employeeRoles,
          pin,
          employmentType: newEmploymentType,
          campusIds: newEmployeeCampusIds,
        });
        setView('list');
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
      setView('list');
    } catch (err: any) {
      setError(err.message ?? 'Could not add admin');
    }
  }

  function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (resettingPin && !/^\d{4}$/.test(newPin)) {
      setError('New PIN must be exactly 4 digits');
      return;
    }

    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      updateEmployee.mutate({
        id,
        name: editName,
        roles: editRoles,
        campusIds: editCampusIds,
        employmentType: editEmploymentType,
        ...(resettingPin ? { pin: newPin } : {}),
      });
    } else {
      for (const id of selectedIds) {
        const emp = employees.find((e) => e.id === id);
        if (!emp) continue;
        const mergedRoles = editRoles.length > 0 ? [...new Set([...emp.roles, ...editRoles])] : undefined;
        updateEmployee.mutate({
          id,
          ...(mergedRoles ? { roles: mergedRoles } : {}),
          ...(campusTouched ? { campusIds: editCampusIds } : {}),
          ...(employmentTypeTouched ? { employmentType: editEmploymentType } : {}),
        });
      }
    }
    setSelectedIds(new Set());
    setView('list');
  }

  function onDeleteEdit() {
    const id = [...selectedIds][0];
    if (!id) return;
    deleteEmployee.mutate(id);
    setSelectedIds(new Set());
    setView('list');
  }

  const roleSuggestions = <datalist id={STAFF_ROLE_SUGGESTIONS_ID}>{staffFieldLabels.map((label) => <option key={label} value={label} />)}</datalist>;

  // ── List view ─────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <Modal
        title="Manage Team"
        onClose={onClose}
        size="wide"
        header={
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Manage Team</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={openEdit}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  selectedIds.size === 0 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-400 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Edit employee{selectedIds.size > 1 ? 's' : ''}
              </button>
              <button type="button" onClick={openAdd} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-700">
                + Add employee
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-1">
                ✕
              </button>
            </div>
          </div>
        }
      >
        {roleSuggestions}

        <div className="flex gap-1 mb-3 border-b border-slate-200">
          {EMPLOYMENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => selectTab(t)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
                activeTab === t ? 'border-blue-700 text-blue-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'FT' ? 'Full-Time' : 'Part-Time'} ({t === 'FT' ? ftCount : ptCount})
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="w-10 px-4 py-2"></th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Roles</th>
                <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Campuses</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-sm text-slate-400 py-6">
                    No {activeTab === 'FT' ? 'full-time' : 'part-time'} coaches{search ? ' match your search' : ' yet'}.
                  </td>
                </tr>
              )}
              {visibleEmployees.map((emp) => (
                <tr key={emp.id} className={`border-t border-slate-100 ${selectedIds.has(emp.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" className="accent-blue-600" checked={selectedIds.has(emp.id)} onChange={() => toggleSelected(emp.id)} />
                  </td>
                  <td className="px-2 py-3 font-medium text-slate-800">{emp.name}</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {emp.roles.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        emp.roles.map((r) => (
                          <span key={r} className="inline-block rounded bg-blue-50 text-blue-800 px-2 py-0.5 text-xs font-medium">
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-slate-600">{campusLabel(emp.campuses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Showing {visibleEmployees.length} of {tabEmployees.length} employees.
        </p>
      </Modal>
    );
  }

  // ── Add / Edit form view ─────────────────────────────────────────────
  const editingSingle = formMode === 'edit' && selectedIds.size === 1;
  const editingBulk = formMode === 'edit' && selectedIds.size > 1;
  const formTitle =
    formMode === 'add' ? (accessLevel === 'COACH' ? 'Add Employee' : 'Add Admin') : editingBulk ? `Edit ${selectedIds.size} employees` : 'Edit employee';

  return (
    <Modal
      title={formTitle}
      onClose={onClose}
      size="wide"
      header={
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <button type="button" onClick={backToList} className="text-sm font-medium text-blue-700 hover:text-blue-900">
              ← Back to team
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mt-2">{formTitle}</h3>
        </div>
      }
    >
      {roleSuggestions}

      <form onSubmit={formMode === 'add' ? onSubmitAdd : onSaveEdit}>
        {/* ── Details ── */}
        <Section title="Details">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {!editingBulk && (
              <Field label="Name">
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder={formMode === 'add' && accessLevel !== 'COACH' ? 'Name (optional)' : 'Employee name'}
                  value={formMode === 'add' ? name : editName}
                  onChange={(e) => (formMode === 'add' ? setName(e.target.value) : setEditName(e.target.value))}
                  required={formMode === 'add' ? accessLevel === 'COACH' : true}
                />
              </Field>
            )}
            {(formMode === 'add' ? accessLevel === 'COACH' : true) && (
              <Field label="Employment type">
                <select
                  value={formMode === 'add' ? newEmploymentType : editEmploymentType}
                  onChange={(e) => {
                    const v = e.target.value as EmploymentType;
                    if (formMode === 'add') setNewEmploymentType(v);
                    else {
                      setEditEmploymentType(v);
                      setEmploymentTypeTouched(true);
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'FT' ? 'Full-Time' : 'Part-Time'}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!editingBulk && (
              <Field label="Account type">
                {formMode === 'add' && canCreateAdmins ? (
                  <select
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="COACH">Coach</option>
                    {ASSIGNABLE_ADMIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  // Converting an existing Employee record into an AdminUser
                  // isn't a real operation this app supports — shown for
                  // visual parity with the mockup, but fixed and disabled.
                  <select disabled value="COACH" className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-500">
                    <option value="COACH">Coach</option>
                  </select>
                )}
              </Field>
            )}
          </div>
        </Section>

        {/* ── Roles (Coach/Employee only) ── */}
        {(formMode === 'add' ? accessLevel === 'COACH' : true) && (
          <Section title="Roles">
            <RoleChipInput
              roles={formMode === 'add' ? employeeRoles : editRoles}
              onChange={formMode === 'add' ? setEmployeeRoles : setEditRoles}
              placeholder={editingBulk ? 'Add a role to all selected' : 'Select roles'}
            />
            {editingBulk && <p className="text-xs text-slate-400 mt-1.5">Roles added here are added to every selected employee — existing roles are kept.</p>}
          </Section>
        )}

        {/* ── Campus assignment ── */}
        {(formMode === 'add' ? accessLevel === 'COACH' : true) && canManageCampusAssignment && campuses.length > 1 && (
          <Section title="Campus assignment">
            <CampusAssignmentField
              allCampuses={campuses}
              selected={formMode === 'add' ? newEmployeeCampusIds : editCampusIds}
              onChange={(ids) => {
                if (formMode === 'add') setNewEmployeeCampusIds(ids);
                else {
                  setEditCampusIds(ids);
                  setCampusTouched(true);
                }
              }}
            />
          </Section>
        )}
        {formMode === 'add' && accessLevel !== 'COACH' && isCampusScoped(accessLevel) && (
          <Section title="Campus assignment">
            <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Select campus…</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Section>
        )}

        {/* ── Access ── */}
        {!editingBulk && (formMode === 'add' ? accessLevel === 'COACH' : true) && (
          <Section title="Access">
            {formMode === 'add' ? (
              <Field label="PIN">
                <SecretField value={pin} onChange={setPin} placeholder="Enter PIN" numeric required />
              </Field>
            ) : (
              <Field label="PIN">
                {resettingPin ? (
                  <SecretField value={newPin} onChange={setNewPin} placeholder="New 4-digit PIN" numeric />
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm tracking-widest text-slate-400">••••</span>
                    <button type="button" onClick={() => setResettingPin(true)} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                      Reset PIN
                    </button>
                  </div>
                )}
              </Field>
            )}
          </Section>
        )}
        {formMode === 'add' && accessLevel !== 'COACH' && (
          <Section title="Access">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email">
                <input
                  type="email"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Temp password">
                <SecretField value={tempPassword} onChange={setTempPassword} placeholder="Temp password" required />
              </Field>
            </div>
          </Section>
        )}

        {error && <p className="text-xs text-red-600 mt-4">{error}</p>}

        <div className="flex items-center justify-between border-t border-slate-100 mt-6 pt-4">
          {editingSingle ? (
            <button type="button" onClick={onDeleteEdit} className="text-sm font-medium text-red-600 hover:underline">
              Remove employee
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={backToList} className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
              {formMode === 'add' ? (accessLevel === 'COACH' ? 'Add employee' : 'Add admin') : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
