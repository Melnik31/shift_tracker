import { ReactNode } from 'react';
import { WIZARD_STEP_LABELS, WizardStep } from '../../lib/onboardingSteps';

export const BTN_PRIMARY = 'rounded-lg bg-slate-900 text-white px-8 py-3 text-base font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
export const BTN_SECONDARY = 'rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
export const INPUT =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500';

// "1 Campuses — 2 Layout — 3 Fields": finished steps get a check, the
// current one is highlighted, later ones are muted.
export function WizardSteps({ current }: { current: WizardStep }) {
  return (
    <ol className="flex items-center justify-center gap-3">
      {WIZARD_STEP_LABELS.map((label, i) => {
        const n = (i + 1) as WizardStep;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3">
            {i > 0 && <span className={`w-12 lg:w-20 h-px ${done || active ? 'bg-blue-300' : 'bg-slate-300'}`} />}
            <span className="flex items-center gap-2">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  done ? 'bg-slate-500 text-white' : active ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-500 bg-white'
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                ) : (
                  n
                )}
              </span>
              <span className={`text-sm ${active ? 'font-semibold text-blue-700' : done ? 'text-slate-700' : 'text-slate-500'}`}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StepHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm text-slate-500 mb-1">{eyebrow}</p>
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{title}</h1>
      <p className="text-lg text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
}

export function WizardFooter({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  busy,
  onSkip,
  error,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  busy?: boolean;
  onSkip: () => void;
  error?: string | null;
}) {
  return (
    <footer className="sticky bottom-0 bg-white border-t border-slate-200 flex-shrink-0">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
        {onBack ? (
          <button onClick={onBack} disabled={busy} className={BTN_SECONDARY}>
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex-1 min-w-[200px] text-center text-sm text-slate-500">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            <>
              You can change this later in Manage Layout.{' '}
              <button onClick={onSkip} className="underline hover:text-slate-800">
                Skip setup (use defaults)
              </button>
            </>
          )}
        </div>
        <button onClick={onNext} disabled={nextDisabled || busy} className={BTN_PRIMARY}>
          {busy ? 'Saving…' : nextLabel}
        </button>
      </div>
    </footer>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</section>;
}
