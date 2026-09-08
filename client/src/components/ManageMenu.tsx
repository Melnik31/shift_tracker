import { useEffect, useRef, useState } from 'react';

// Consolidates the Matrix's several "Manage X" actions into one dropdown so
// the actions row doesn't grow a new top-level button every time an admin
// area is added. Closes on an outside click — mouse-leave doesn't work here
// since the menu is absolutely positioned below the button with a small
// gap; the cursor crossing that gap on its way to an item would leave the
// wrapper's hoverable area and close the menu before the click ever landed.
export default function ManageMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-1.5"
      >
        Manage
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 min-w-[190px] bg-white border border-slate-200 rounded-md shadow-lg z-40">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="block w-full text-left px-3.5 py-2.5 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 hover:text-slate-900"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
