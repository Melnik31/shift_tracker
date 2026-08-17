import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function EmployeeLogin() {
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/employee/login', { workspaceCode, pin });
      await refresh();
      navigate('/my-shifts');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-sm w-full">
        <h1 className="text-xl font-semibold text-slate-800 mb-6">Employee Login</h1>

        <label className="block text-sm font-medium text-slate-600 mb-1">Workspace Code</label>
        <input
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={workspaceCode}
          onChange={(e) => setWorkspaceCode(e.target.value.toUpperCase())}
          placeholder="e.g. SENTRY1"
          required
        />

        <label className="block text-sm font-medium text-slate-600 mb-1">4-digit PIN</label>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          required
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-700 transition disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <Link to="/" className="block text-center text-sm text-slate-500 mt-4 hover:underline">
          Back
        </Link>
      </form>
    </div>
  );
}
