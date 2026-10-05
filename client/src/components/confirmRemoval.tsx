import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';

type Confirm = ReturnType<typeof useConfirm>;

// Asks the server how many existing shifts a removal would delete, so the
// warning is concrete instead of generic. Falls back to the generic wording
// if that lookup fails — the removal itself is never blocked by it.
export async function confirmRemoval(
  confirm: Confirm,
  opts: { kind: 'section' | 'location' | 'subrow'; id: string; title: string; contains?: string; confirmLabel: string }
): Promise<boolean> {
  let impact: string;
  try {
    const { shifts, upcoming } = await api.get<{ shifts: number; upcoming: number }>(`/layout/impact?kind=${opts.kind}&id=${opts.id}`);
    impact =
      shifts === 0
        ? 'No shifts are scheduled on it, so nothing already on the schedule is affected.'
        : `${shifts} existing shift${shifts === 1 ? '' : 's'}${upcoming > 0 ? ` (${upcoming} upcoming)` : ''} will be permanently deleted, along with ${
            shifts === 1 ? 'its' : 'their'
          } staff assignments and attachments.`;
  } catch {
    impact = 'Every shift scheduled on it will be permanently deleted.';
  }
  return confirm({
    title: opts.title,
    message: (
      <>
        {opts.contains && <span className="block mb-1">{opts.contains}</span>}
        <span className="block">{impact}</span>
        <span className="block mt-1 font-medium text-slate-700">This cannot be undone.</span>
      </>
    ),
    confirmLabel: opts.confirmLabel,
  });
}
