import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function AdminSignup() {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceCode, setWorkspaceCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/admin/signup', { workspaceName, workspaceCode, email, password });
      await refresh();
      navigate('/onboarding');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-sm w-full">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">Create your workspace</h1>
        <p className="text-sm text-slate-500 mb-6">This is what your team will call your operation — e.g. a zone map, a fleet, a set of wards. You'll define the specifics next.</p>

        <label className="block text-sm font-medium text-slate-600 mb-1">Workspace Name</label>
        <input
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="e.g. Acme Corp Operations"
          required
        />

        <label className="block text-sm font-medium text-slate-600 mb-1">Workspace Code</label>
        <input
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={workspaceCode}
          onChange={(e) => setWorkspaceCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
          placeholder="e.g. ACME1"
          required
        />

        <label className="block text-sm font-medium text-slate-600 mb-1">Admin Email</label>
        <input
          type="email"
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
        <input
          type="password"
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-700 transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Workspace'}
        </button>

        <Link to="/admin/login" className="block text-center text-sm text-slate-500 mt-4 hover:underline">
          Already have a workspace? Log in
        </Link>
      </form>
    </div>
  );
}
