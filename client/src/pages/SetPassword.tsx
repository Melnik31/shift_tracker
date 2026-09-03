import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

// Shown when /me's admin.mustChangePassword is true (see App.tsx's
// RequireAdmin) — an ADMIN/CEO created this account with a temp password,
// and it must be replaced before any other admin page loads.
export default function SetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/admin/change-password', { newPassword });
      await refresh();
      navigate('/matrix');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={onSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-sm w-full">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Set Your Password</h1>
        <p className="text-sm text-slate-500 mb-6">Your account was created with a temporary password. Choose a new one to continue.</p>

        <label className="block text-sm font-medium text-slate-600 mb-1">New Password</label>
        <input
          type="password"
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />

        <label className="block text-sm font-medium text-slate-600 mb-1">Confirm Password</label>
        <input
          type="password"
          className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-700 transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Set Password & Continue'}
        </button>
      </form>
    </div>
  );
}
