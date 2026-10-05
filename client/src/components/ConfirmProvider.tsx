import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  /** Red button for destructive actions (the default). Pass false for neutral ones like logging out. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// One app-wide confirmation dialog, used as
//   if (!(await confirm({ title: 'Delete section?', message: '...' }))) return;
// so every destructive action warns the same way instead of each caller
// hand-rolling a window.confirm or inline prompt.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      }),
    []
  );

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    // Focus Cancel, not the destructive button, so a stray Enter can't delete anything.
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pending?.resolve(false);
        setPending(null);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending]);

  const options = pending?.options;
  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && options && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] px-4" onClick={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-base font-semibold text-slate-800">
              {options.title}
            </h3>
            {options.message && <div className="mt-2 text-sm text-slate-600">{options.message}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={() => close(false)}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => close(true)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium text-white ${
                  destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-700'
                }`}
              >
                {options.confirmLabel ?? (destructive ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
