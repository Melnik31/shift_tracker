import { useMemo, useState } from 'react';
import { useCampuses } from '../../hooks/useCampuses';
import { useLayout, useLayoutMutations } from '../../hooks/useLayout';
import { Section } from '../../lib/types';
import { useConfirm } from '../../components/ConfirmProvider';
import { confirmRemoval } from '../../components/confirmRemoval';
import LayoutPreview, { PreviewSection } from '../../components/LayoutPreview';
import { INPUT, Panel, StepHeading, WizardFooter } from './WizardParts';

type Campus = { id: string; name: string };
type Mutations = ReturnType<typeof useLayoutMutations>;

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" />
    </svg>
  );
}

function CampusSelect({ campuses, value, onChange }: { campuses: Campus[]; value: string; onChange: (id: string) => void }) {
  if (campuses.length < 2) return null;
  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">Campus</label>
      <select className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Renames on blur; an uncontrolled input keyed by id keeps typing smooth.
function SavedNameInput({ value, label, onSave, onTrash }: { value: string; label: string; onSave: (name: string) => void; onTrash: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        className={INPUT}
        defaultValue={value}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== value && onSave(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button onClick={onTrash} title="Remove" className="p-2 text-slate-400 hover:text-red-600 flex-shrink-0">
        <TrashIcon />
      </button>
    </div>
  );
}

// An already-saved section: everything persists as you edit, like the
// Manage Layout screen it hands off to.
function SectionCard({ section, campuses, mutations }: { section: Section; campuses: Campus[]; mutations: Mutations }) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fieldCount = section.locations.reduce((n, l) => n + l.subRows.length, 0);

  async function commitLocation() {
    const name = newLocation.trim();
    setAdding(false);
    setNewLocation('');
    if (!name) return;
    try {
      await mutations.addLocation.mutateAsync({ sectionId: section.id, name });
    } catch (err: any) {
      setError(err.message ?? 'Could not add location');
    }
  }

  return (
    <Panel className="p-6">
      <CampusSelect campuses={campuses} value={section.campusId} onChange={(campusId) => mutations.updateSection.mutate({ id: section.id, campusId })} />
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">Section name</label>
      <div className="flex items-center gap-2 mb-5">
        <input
          aria-label="Section name"
          key={section.id}
          className={INPUT}
          defaultValue={section.name}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== section.name && mutations.updateSection.mutate({ id: section.id, name: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button
          onClick={async () => {
            if (
              await confirmRemoval(confirm, {
                kind: 'section',
                id: section.id,
                title: `Remove section "${section.name}"?`,
                contains: `This also deletes its ${section.locations.length} location${section.locations.length === 1 ? '' : 's'} and ${fieldCount} field${fieldCount === 1 ? '' : 's'}.`,
                confirmLabel: 'Remove section',
              })
            )
              mutations.deleteSection.mutate(section.id);
          }}
          title="Remove section"
          className="p-2 text-slate-400 hover:text-red-600 flex-shrink-0"
        >
          <TrashIcon />
        </button>
      </div>

      <label className="block text-sm font-semibold text-slate-800 mb-1.5">Locations</label>
      <div className="space-y-3">
        {section.locations.map((loc) => (
          <SavedNameInput
            key={loc.id}
            label="Location name"
            value={loc.name}
            onSave={(name) => mutations.updateLocation.mutate({ id: loc.id, name })}
            onTrash={async () => {
              if (
                await confirmRemoval(confirm, {
                  kind: 'location',
                  id: loc.id,
                  title: `Remove location "${loc.name}"?`,
                  contains: `This also deletes its ${loc.subRows.length} field${loc.subRows.length === 1 ? '' : 's'}.`,
                  confirmLabel: 'Remove location',
                })
              )
                mutations.deleteLocation.mutate(loc.id);
            }}
          />
        ))}
        {adding && (
          <input
            autoFocus
            aria-label="New location name"
            className={INPUT}
            placeholder="e.g. Rink A"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onBlur={commitLocation}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLocation();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewLocation('');
              }
            }}
          />
        )}
      </div>
      <button onClick={() => setAdding(true)} className="mt-3 flex items-center gap-2 text-base font-medium text-blue-700 hover:text-blue-900">
        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-sm leading-5 text-center">+</span> Add location
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </Panel>
  );
}

export default function StepLayout({ onBack, onNext, onSkip }: { onBack: () => void; onNext: () => Promise<void>; onSkip: () => void }) {
  const { data } = useLayout();
  const { data: campusData } = useCampuses();
  const mutations = useLayoutMutations();
  const sections = data?.sections ?? [];
  const campuses: Campus[] = useMemo(
    () => [...(campusData?.campuses ?? [])].filter((c) => c.active).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder),
    [campusData]
  );
  const defaultCampusId = campuses[0]?.id ?? '';

  // The "new section" form is a local draft that is committed (section +
  // its locations) by "Add section" or automatically on Continue.
  const [draft, setDraft] = useState<{ campusId: string; name: string; locations: string[] }>({ campusId: '', name: '', locations: [''] });
  const [draftOpen, setDraftOpen] = useState<boolean | null>(null);
  const showDraft = draftOpen ?? (data ? sections.length === 0 : false);
  const draftCampusId = draft.campusId || defaultCampusId;
  const draftLocations = draft.locations.map((l) => l.trim()).filter(Boolean);
  const draftHasName = draft.name.trim().length > 0;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedLocationCount = sections.reduce((n, s) => n + s.locations.length, 0);
  const totalLocations = savedLocationCount + (draftHasName ? draftLocations.length : 0);

  async function commitDraft(): Promise<void> {
    const created = (await mutations.addSection.mutateAsync({ name: draft.name.trim(), campusId: draftCampusId || undefined })) as { id: string };
    for (const name of draftLocations) await mutations.addLocation.mutateAsync({ sectionId: created.id, name });
    setDraft({ campusId: '', name: '', locations: [''] });
    setDraftOpen(false);
  }

  async function addSectionClicked() {
    setError(null);
    if (!draftHasName) return;
    try {
      await commitDraft();
    } catch (err: any) {
      setError(err.message ?? 'Could not add section');
    }
  }

  async function next() {
    setError(null);
    setSaving(true);
    try {
      if (draftHasName) await commitDraft();
      await onNext();
    } catch (err: any) {
      setError(err.message ?? 'Could not save layout');
      setSaving(false);
    }
  }

  const preview: PreviewSection[] = [
    ...sections.map((s) => ({ campusId: s.campusId, name: s.name, locations: s.locations.map((l) => ({ name: l.name })) })),
    ...(draftHasName ? [{ campusId: draftCampusId, name: draft.name.trim(), locations: draftLocations.map((name) => ({ name })) }] : []),
  ];

  return (
    <>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <StepHeading eyebrow="03 · Schedule layout" title="Build your first schedule" subtitle="Add a section and the locations within it." />

        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
          <div className="space-y-5">
            {sections.map((s) => (
              <SectionCard key={s.id} section={s} campuses={campuses} mutations={mutations} />
            ))}

            {showDraft ? (
              <Panel className="p-6">
                <CampusSelect campuses={campuses} value={draftCampusId} onChange={(campusId) => setDraft((d) => ({ ...d, campusId }))} />
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Section name</label>
                <input
                  aria-label="New section name"
                  className={`${INPUT} mb-5`}
                  placeholder="e.g. Ice"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />

                <label className="block text-sm font-semibold text-slate-800 mb-1.5">Locations</label>
                <div className="space-y-3">
                  {draft.locations.map((loc, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        aria-label={`New location ${i + 1}`}
                        // A freshly added (empty, trailing) row takes focus so you can just keep typing.
                        autoFocus={i > 0 && i === draft.locations.length - 1 && loc === ''}
                        className={INPUT}
                        placeholder={i === 0 ? 'e.g. Rink A' : 'Another location'}
                        value={loc}
                        onChange={(e) => setDraft((d) => ({ ...d, locations: d.locations.map((l, j) => (j === i ? e.target.value : l)) }))}
                      />
                      {draft.locations.length > 1 && (
                        <button
                          onClick={() => setDraft((d) => ({ ...d, locations: d.locations.filter((_, j) => j !== i) }))}
                          title="Remove"
                          className="p-2 text-slate-400 hover:text-red-600 flex-shrink-0"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setDraft((d) => ({ ...d, locations: [...d.locations, ''] }))}
                  className="mt-3 flex items-center gap-2 text-base font-medium text-blue-700 hover:text-blue-900"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-sm leading-5 text-center">+</span> Add location
                </button>

                <div className="mt-6 pt-5 border-t border-slate-200 flex gap-2">
                  <button
                    onClick={addSectionClicked}
                    disabled={!draftHasName}
                    className="flex-1 rounded-lg border-2 border-dashed border-blue-300 py-3 text-base font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    + Add section
                  </button>
                  {sections.length > 0 && (
                    <button onClick={() => setDraftOpen(false)} className="rounded-lg px-4 py-3 text-base text-slate-500 hover:bg-slate-100">
                      Cancel
                    </button>
                  )}
                </div>
              </Panel>
            ) : (
              <button
                onClick={() => setDraftOpen(true)}
                className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 py-5 text-base font-medium text-blue-700 hover:bg-white"
              >
                + Add section
              </button>
            )}
          </div>

          <Panel className="p-6 lg:sticky lg:top-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold text-slate-900">Live preview</h2>
              <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-medium">Layout only</span>
            </div>
            <LayoutPreview campuses={campuses} sections={preview} />
          </Panel>
        </div>
      </main>
      <WizardFooter onBack={onBack} onNext={next} nextLabel="Continue" nextDisabled={totalLocations === 0 || !data} busy={saving} onSkip={onSkip} error={error} />
    </>
  );
}
