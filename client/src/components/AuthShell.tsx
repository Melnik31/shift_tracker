import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
        <path d="M8 14h2M12 14h2M8 17.5h2" />
      </svg>
      <span className="text-xl font-bold tracking-tight text-slate-900">ShiftTracker</span>
    </span>
  );
}

// Shared page frame for signup and the setup wizard: a top bar with the
// logo, an optional centre slot (the wizard's step indicator), and an
// optional "Log in" link, over a light slate canvas.
export default function AuthShell({
  center,
  showLogin = false,
  children,
  footer,
}: {
  center?: ReactNode;
  showLogin?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Logo />
          <div className="hidden sm:block flex-1">{center}</div>
          <div className="w-20 flex justify-end">
            {showLogin && (
              <Link to="/admin/login" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
      {footer}
    </div>
  );
}
