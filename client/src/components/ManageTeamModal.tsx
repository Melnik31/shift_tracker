import { FormEvent, useState } from 'react';
import { useEmployees, useEmployeeMutations } from '../hooks/useEmployees';
import Modal from './Modal';

export default function ManageTeamModal({ onClose }: { onClose: () => void }) {
  const { data } = useEmployees();
  const { addEmployee, updateEmployee, deleteEmployee } = useEmployeeMutations();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    try {
      await addEmployee.mutateAsync({ name, role: role || 'Employee', pin });
      setName('');
      setRole('');
      setPin('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add employee');
    }
  }

  return (
    <Modal title="Manage Team" onClose={onClose}>
      <ul className="space-y-2 mb-6 max-h-64 overflow-y-auto">
        {(data?.employees ?? []).map((emp) => (
          <li key={emp.id} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
            <div>
              <input
                className="font-medium text-sm text-slate-800 border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1"
                defaultValue={emp.name}
                onBlur={(e) => e.target.value !== emp.name && updateEmployee.mutate({ id: emp.id, name: e.target.value })}
              />
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
        <h4 className="text-sm font-medium text-slate-600 mb-2">Add Employee</h4>
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
            value={role}
            onChange={(e) => setRole(e.target.value)}
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
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button type="submit" className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700">
          Add
        </button>
      </form>
    </Modal>
  );
}
