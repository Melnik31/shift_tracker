import { ReactNode } from 'react';

// `size` and `header` are both optional and default to exactly today's
// behavior — every existing caller (ManageLayoutModal, ManageAdminsModal,
// ManageCampusesModal, NewShiftBlockModal, EditShiftBlockModal,
// AddShiftModal) is unaffected. `header`, when provided, fully replaces the
// default title+close row — for a caller (ManageTeamModal) that needs a
// differently-shaped header (e.g. a back link above the title) instead of
// the plain title-and-close-button row.
export default function Modal({
  title,
  onClose,
  children,
  size = 'default',
  header,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
  header?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 px-4" onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-h-[85vh] overflow-y-auto ${
          size === 'wide' ? 'max-w-3xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {header ?? (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
