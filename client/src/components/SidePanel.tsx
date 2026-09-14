import { ReactNode } from 'react';

// Docks to the right edge of the viewport instead of centering, matching
// the reference screenshot's right-side detail panel. Used by
// NewShiftBlockModal (triggered from the Matrix's floating "+" button) so
// shift creation reads as a slide-in panel rather than a centered dialog —
// every other modal in the app keeps using the centered Modal.
export default function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}>
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
