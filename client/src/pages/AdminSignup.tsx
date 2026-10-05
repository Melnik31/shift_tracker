import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import AuthShell from '../components/AuthShell';
import { cleanWorkspaceCode, suggestWorkspaceCode, WORKSPACE_CODE_PATTERN } from '../lib/workspaceCode';

const INPUT =
  'w-full rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500';

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export default function AdminSignup() {
  const [workspaceName, setWorkspaceName] = useState('');
  // The code follows the name (a suggestion) until the user edits it.
  const [customCode, setCustomCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const workspaceCode = customCode ?? suggestWorkspaceCode(workspaceName);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!WORKSPACE_CODE_PATTERN.test(workspaceCode)) {
      setEditingCode(true);
      setError('Workspace code must be 3-16 letters or numbers.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/admin/signup', { workspaceName: workspaceName.trim(), workspaceCode, email: email.trim(), password });
      await refresh();
      navigate('/onboarding');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Sign up failed';
      // A taken code is fixed by changing the code, so open it for editing.
      if (err instanceof ApiError && err.status === 409) setEditingCode(true);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell showLogin>
      <main className="flex-1 flex items-start justify-center px-4 py-12 sm:py-16">
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 sm:px-10 py-10 w-full max-w-xl">
          <p className="text-center text-sm text-slate-500 mb-2">01 · Registration</p>
          <h1 className="text-center text-3xl font-bold text-slate-900">Create your workspace</h1>
          <p className="text-center text-slate-500 mt-2 mb-8">Start scheduling your team.</p>

          <label className="block text-sm font-semibold text-slate-800 mb-2" htmlFor="ws-name">
            Workspace name
          </label>
          <input
            id="ws-name"
            className={INPUT}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. MEGA Goaltending"
            autoFocus
            required
          />

          <div className="mt-2 mb-6 text-sm text-slate-500">
            {editingCode ? (
              <div className="flex items-center gap-2">
                <span>Workspace code:</span>
                <input
                  autoFocus
                  aria-label="Workspace code"
                  className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={workspaceCode}
                  onChange={(e) => setCustomCode(cleanWorkspaceCode(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setEditingCode(false);
                    }
                  }}
                />
                <button type="button" onClick={() => setEditingCode(false)} className="font-medium text-blue-600 hover:underline">
                  Done
                </button>
              </div>
            ) : (
              <p>
                Workspace code: <span className="font-bold text-slate-900">{workspaceCode || '—'}</span>{' '}
                <button type="button" onClick={() => setEditingCode(true)} className="ml-1 font-medium text-blue-600 hover:underline">
                  Edit
                </button>
              </p>
            )}
            <p className="mt-0.5">Your team uses this code to sign in.</p>
          </div>

          <label className="block text-sm font-semibold text-slate-800 mb-2" htmlFor="ws-email">
            Your email
          </label>
          <input id="ws-email" type="email" className={`${INPUT} mb-6`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />

          <label className="block text-sm font-semibold text-slate-800 mb-2" htmlFor="ws-password">
            Password
          </label>
          <div className="relative">
            <input
              id="ws-password"
              type={showPassword ? 'text' : 'password'}
              className={`${INPUT} pr-12`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 rounded-lg bg-slate-900 text-white py-3.5 text-base font-semibold hover:bg-slate-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create workspace'}
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/admin/login" className="font-medium text-blue-600 hover:underline">
              Log in
            </Link>
          </div>
        </form>
      </main>
    </AuthShell>
  );
}
