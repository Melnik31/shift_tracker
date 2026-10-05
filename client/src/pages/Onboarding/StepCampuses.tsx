import { useEffect, useState } from 'react';
import { useCampuses, useCampusMutations } from '../../hooks/useCampuses';
import { INPUT, Panel, StepHeading, WizardFooter } from './WizardParts';

interface Row {
  id?: string; // present for campuses that already exist
  name: string;
}

// Step 1. Every workspace already has one default campus (created at
// signup), so the first input renames it; extra inputs add more. Re-visiting
// the step (Back, or resuming) shows what exists and only saves changes.
export default function StepCampuses({ onNext, onSkip }: { onNext: () => Promise<void>; onSkip: () => void }) {
  const { data } = useCampuses();
  const { addCampus, updateCampus } = useCampusMutations();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rows || !data) return;
    const sorted = [...data.campuses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder);
    setRows(sorted.map((c) => ({ id: c.id, name: c.name })));
    setOriginal(Object.fromEntries(sorted.map((c) => [c.id, c.name])));
  }, [data, rows]);

  const list = rows ?? [];
  const firstBlank = !list[0]?.name.trim();

  function setName(index: number, name: string) {
    setRows((prev) => (prev ?? []).map((r, i) => (i === index ? { ...r, name } : r)));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      for (const row of list) {
        const name = row.name.trim();
        if (row.id) {
          if (name && name !== original[row.id]) await updateCampus.mutateAsync({ id: row.id, name });
        } else if (name) {
          await addCampus.mutateAsync(name);
        }
      }
      await onNext();
    } catch (err: any) {
      setError(err.message ?? 'Could not save campuses');
      setSaving(false);
    }
  }

  return (
    <>
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-3xl">
          <p className="text-center text-sm text-slate-500 mb-4">02 · Campuses</p>
          <Panel className="px-6 sm:px-12 py-10">
            <h1 className="text-3xl font-bold text-slate-900">Where does your team work?</h1>
            <p className="text-lg text-slate-500 mt-2 mb-8">Add the campuses or branches you schedule.</p>

            <label className="block text-sm font-semibold text-slate-800 mb-2">Campus name</label>
            <div className="space-y-3">
              {list.map((row, i) => (
                <input
                  key={row.id ?? `new-${i}`}
                  aria-label={`Campus ${i + 1} name`}
                  className={INPUT}
                  value={row.name}
                  placeholder={i === 0 ? 'e.g. Plymouth' : 'Another campus'}
                  autoFocus={i === list.length - 1 && list.length > 1}
                  onChange={(e) => setName(i, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !firstBlank && save()}
                />
              ))}
            </div>

            <button
              onClick={() => setRows((prev) => [...(prev ?? []), { name: '' }])}
              className="mt-4 flex items-center gap-2 text-base font-medium text-blue-700 hover:text-blue-900"
            >
              <span className="text-xl leading-none">+</span> Add another campus
            </button>
            <p className="text-sm text-slate-500 mt-6">You can add more later.</p>
          </Panel>
        </div>
      </main>
      <WizardFooter onNext={save} nextLabel="Continue" nextDisabled={firstBlank || !rows} busy={saving} onSkip={onSkip} error={error} />
    </>
  );
}
