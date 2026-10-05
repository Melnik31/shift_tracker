import { ReactNode, useEffect, useRef, useState } from 'react';

// Shared chrome for the simple "list + edit" Manage modals (Campuses, Admins),
// matching ManageLayoutModal's look: fixed-height card, header with the
// primary action, scrolling body, Done footer.

export const INPUT = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400';
export const BTN_PRIMARY = 'rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-40';
export const BTN_SECONDARY = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';
export const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-left';

export function ManageShell({
  title,
  subtitle,
  action,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {action}
            <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-36">{children}</div>
        <div className="flex justify-end px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose} className={BTN_PRIMARY}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'amber' }) {
  const tones = { slate: 'bg-slate-100 text-slate-600', blue: 'bg-blue-50 text-blue-800', amber: 'bg-amber-50 text-amber-700' };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium flex-shrink-0 ${tones[tone]}`}>{children}</span>;
}

export function RowMenu({ items }: { items: { label: string; onClick: () => void; disabled?: boolean; title?: string; destructive?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        title="More actions"
        className="w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 text-lg leading-none flex items-center justify-center"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-1.5 text-sm disabled:opacity-30 ${
                item.destructive ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
