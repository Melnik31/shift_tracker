import { useMemo, useState } from 'react';
import { useCampuses } from '../../hooks/useCampuses';
import { useLayout, useLayoutMutations } from '../../hooks/useLayout';
import { api } from '../../lib/api';
import { DATA_TYPES, DataType, Location, Section } from '../../lib/types';
import { DATA_TYPE_INFO } from '../../lib/constants';
import { FIELD_PRESETS, TypeIcon } from '../../lib/fieldPresets';
import LayoutPreview, { PreviewSection } from '../../components/LayoutPreview';
import { INPUT, Panel, StepHeading, WizardFooter } from './WizardParts';

interface FieldDraft {
  key: string;
  label: string;
  dataType: DataType;
  checked: boolean;
  presetKey?: string;
  custom?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

function initialDraft(loc: Location): FieldDraft[] {
  const existing = new Set(loc.subRows.map((r) => norm(r.label)));
  return FIELD_PRESETS.map((p) => ({
    key: p.key,
    label: p.label,
    dataType: p.dataType,
    // A field the location already has shows as checked, so re-running the
    // wizard never proposes (or creates) a duplicate.
    checked: p.defaultChecked || existing.has(norm(p.label)),
    presetKey: p.key,
  }));
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M13.6 3.4a1.5 1.5 0 012.1 0l.9.9a1.5 1.5 0 010 2.1L7.5 15.5 3.5 16.5l1-4L13.6 3.4z" />
    </svg>
  );
}

function FieldRow({
  field,
  onChange,
}: {
  field: FieldDraft;
  onChange: (patch: Partial<FieldDraft>) => void;
}) {
  const [editing, setEditing] = useState(field.custom && !field.label);
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${field.checked ? 'border-slate-300 bg-white' : 'border-slate-200 bg-white'}`}>
      <input
        type="checkbox"
        aria-label={`Include ${field.label || 'field'}`}
        className="w-5 h-5 accent-blue-600 flex-shrink-0"
        checked={field.checked}
        onChange={(e) => onChange({ checked: e.target.checked })}
      />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            aria-label="Field name"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={field.label}
            placeholder="Field name"
            onChange={(e) => onChange({ label: e.target.value })}
            onBlur={() => field.label.trim() && setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && field.label.trim() && setEditing(false)}
          />
        ) : (
          <>
            <span className="text-base font-medium text-slate-900 truncate">{field.label}</span>
            <button onClick={() => setEditing(true)} title="Rename" className="text-slate-400 hover:text-slate-700 flex-shrink-0">
              <PencilIcon />
            </button>
          </>
        )}
      </div>
      <label className="relative flex items-center gap-2 rounded-lg bg-blue-50 text-slate-800 pl-3 pr-2 py-1.5 flex-shrink-0">
        <TypeIcon type={field.dataType} className="w-4 h-4 text-slate-600" />
        <select
          aria-label="Field type"
          className="appearance-none bg-transparent text-sm font-medium pr-5 focus:outline-none cursor-pointer"
          value={field.dataType}
          onChange={(e) => onChange({ dataType: e.target.value as DataType })}
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {DATA_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-500 absolute right-2 pointer-events-none" fill="currentColor" aria-hidden="true">
          <path d="M5 7l5 6 5-6H5z" />
        </svg>
      </label>
    </div>
  );
}

// Step 3. Pick which fields each location tracks. Nothing is written until
// "Open schedule", and creation skips any label a location already has.
export default function StepFields({ onBack, onFinish, onSkip }: { onBack: () => void; onFinish: () => Promise<void>; onSkip: () => void }) {
  const { data } = useLayout();
  const { data: campusData } = useCampuses();
  const { addSubRow, updateSubRow } = useLayoutMutations();
  const sections: Section[] = data?.sections ?? [];
  const campuses = campusData?.campuses ?? [];

  const allLocations = sections.flatMap((s) => s.locations.map((l) => ({ section: s, location: l })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = allLocations.find((x) => x.location.id === selectedId) ?? allLocations[0];
  const [applyAll, setApplyAll] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, FieldDraft[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftFor = (loc: Location) => drafts[loc.id] ?? initialDraft(loc);
  // "Apply to all" copies the selected location's choices onto every
  // location in the same section; other sections keep their own.
  const effectiveDraft = (section: Section, loc: Location): FieldDraft[] =>
    applyAll && selected && section.id === selected.section.id ? draftFor(selected.location) : draftFor(loc);

  function patchField(key: string, patch: Partial<FieldDraft>) {
    if (!selected) return;
    const loc = selected.location;
    setDrafts((prev) => ({ ...prev, [loc.id]: (prev[loc.id] ?? initialDraft(loc)).map((f) => (f.key === key ? { ...f, ...patch } : f)) }));
  }
  function addCustom() {
    if (!selected) return;
    const loc = selected.location;
    setDrafts((prev) => ({
      ...prev,
      [loc.id]: [...(prev[loc.id] ?? initialDraft(loc)), { key: `custom-${Date.now()}`, label: '', dataType: 'TEXT', checked: true, custom: true }],
    }));
  }

  const preview: PreviewSection[] = useMemo(
    () =>
      sections.map((s) => ({
        campusId: s.campusId,
        name: s.name,
        locations: s.locations.map((l) => {
          const chosen = effectiveDraft(s, l)
            .filter((f) => f.checked && f.label.trim())
            .map((f) => f.label.trim());
          const extras = l.subRows.map((r) => r.label).filter((label) => !chosen.some((c) => norm(c) === norm(label)));
          return { name: l.name, fields: [...chosen, ...extras] };
        }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, drafts, applyAll, selected?.location.id]
  );

  async function open() {
    setError(null);
    setSaving(true);
    try {
      for (const { section, location } of allLocations) {
        const have = new Set(location.subRows.map((r) => norm(r.label)));
        let hasGroupField = location.subRows.some((r) => r.isGroupField);
        for (const f of effectiveDraft(section, location)) {
          const label = f.label.trim();
          if (!f.checked || !label || have.has(norm(label))) continue;
          have.add(norm(label));
          const created = (await addSubRow.mutateAsync({ locationId: location.id, label, dataType: f.dataType })) as { id: string };
          const preset = FIELD_PRESETS.find((p) => p.key === f.presetKey);
          // The Group / Tier badge doubles as the Location's Group field
          // (powers the Coach Group Hours report) unless one is already set.
          if (preset?.isGroupField && f.dataType === 'BADGE' && !hasGroupField) {
            await updateSubRow.mutateAsync({ id: created.id, isGroupField: true });
            hasGroupField = true;
          }
        }
      }
      await onFinish();
    } catch (err: any) {
      setError(err.message ?? 'Could not save fields');
      setSaving(false);
    }
  }

  const campusName = (id: string) => campuses.find((c) => c.id === id)?.name ?? 'Campus';
  const sectionLocations = selected?.section.locations ?? [];

  return (
    <>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <StepHeading eyebrow="04 · Choose fields" title="What should each location track?" subtitle="Choose fields for your schedule." />

        {!selected ? (
          <Panel className="p-8 text-center text-slate-500">Add at least one location in the previous step first.</Panel>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
            <Panel className="p-6">
              <select
                aria-label="Location"
                className="w-full text-xl font-bold text-slate-900 bg-transparent border-b border-slate-200 pb-3 mb-5 focus:outline-none cursor-pointer"
                value={selected.location.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {allLocations.map(({ section, location }) => (
                  <option key={location.id} value={location.id}>
                    {campusName(section.campusId)} / {section.name} / {location.name}
                  </option>
                ))}
              </select>

              <div className="space-y-3">
                {draftFor(selected.location).map((f) => (
                  <FieldRow key={f.key} field={f} onChange={(patch) => patchField(f.key, patch)} />
                ))}
                {selected.location.subRows
                  .filter((r) => !draftFor(selected.location).some((f) => norm(f.label) === norm(r.label)))
                  .map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
                      <input type="checkbox" checked disabled className="w-5 h-5" aria-label={`${r.label} already added`} />
                      <span className="flex-1 truncate">{r.label}</span>
                      <span className="text-xs">Already added</span>
                    </div>
                  ))}
              </div>

              <button
                onClick={addCustom}
                className="mt-4 w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 py-3 text-base font-medium text-blue-700 hover:bg-blue-50"
              >
                + Custom field
              </button>

              {sectionLocations.length > 1 && (
                <label className="mt-6 pt-5 border-t border-slate-200 flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-blue-600" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
                  <span>
                    <span className="block text-base font-semibold text-slate-900">Apply to all {sectionLocations.length} locations in {selected.section.name}</span>
                    <span className="block text-sm text-slate-500">
                      {sectionLocations.length <= 3
                        ? sectionLocations.map((l) => l.name).join(' and ')
                        : `${sectionLocations
                            .slice(0, 2)
                            .map((l) => l.name)
                            .join(', ')} and ${sectionLocations.length - 2} more`}
                    </span>
                  </span>
                </label>
              )}
            </Panel>

            <Panel className="p-6 lg:sticky lg:top-6">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl font-bold text-slate-900">Live preview</h2>
                <span className="rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-medium">Layout only</span>
              </div>
              <LayoutPreview campuses={campuses} sections={preview} />
            </Panel>
          </div>
        )}
      </main>
      <WizardFooter onBack={onBack} onNext={open} nextLabel="Open schedule" nextDisabled={!selected} busy={saving} onSkip={onSkip} error={error} />
    </>
  );
}
