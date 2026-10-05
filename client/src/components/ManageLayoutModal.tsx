import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLayout, useLayoutMutations } from '../hooks/useLayout';
import { useCampuses } from '../hooks/useCampuses';
import { DATA_TYPES, DataType, Location, Section, SubRow } from '../lib/types';
import { DATA_TYPE_INFO } from '../lib/constants';
import { api } from '../lib/api';
import { useConfirm } from './ConfirmProvider';
import { confirmRemoval } from './confirmRemoval';

type Selection = { kind: 'section'; id: string } | { kind: 'location'; id: string } | null;

const INPUT = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400';
const BTN_PRIMARY = 'rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-40';
const BTN_SECONDARY = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50';

// campusId mirrors whatever the Matrix's Campus selector is currently set
// to: a specific campus scopes this modal to exactly that campus's sections
// (so editing Blaine never shows Plymouth's layout), matching what the
// Matrix itself already shows. null ("All Campuses") shows everything.
//
// Split-panel editor: a searchable Section → Location tree on the left, and
// the selected Section/Location's details on the right — fields (sub-rows)
// are edited in a table instead of a long nested list.
export default function ManageLayoutModal({ onClose, campusId }: { onClose: () => void; campusId: string | null }) {
  const { data } = useLayout(campusId);
  const { data: campusData } = useCampuses();
  const mutations = useLayoutMutations();
  const allSections = data?.sections ?? [];

  const allCampuses = campusData?.campuses ?? [];
  const activeCampuses = allCampuses.filter((c) => c.active);
  const campusNameById = new Map(allCampuses.map((c) => [c.id, c.name]));
  const scopedCampusName = campusId ? campusNameById.get(campusId) : null;

  // Narrows the tree to one campus. Only offered when the modal isn't
  // already scoped to a campus by the Matrix's selector (that already
  // limits `data` to exactly one campus).
  const [campusFilter, setCampusFilter] = useState('');
  const showCampusFilter = !campusId && activeCampuses.length > 1;
  const sections = campusFilter && showCampusFilter ? allSections.filter((s) => s.campusId === campusFilter) : allSections;

  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingSection, setAddingSection] = useState(false);

  // Keep the selection valid: default to the first location, and fall back
  // when the selected item was deleted (or filtered out by a campus change).
  const selectionExists =
    selection?.kind === 'section'
      ? sections.some((s) => s.id === selection.id)
      : selection?.kind === 'location'
        ? sections.some((s) => s.locations.some((l) => l.id === selection.id))
        : false;
  useEffect(() => {
    if (!data || selectionExists) return;
    const firstLocation = sections.flatMap((s) => s.locations)[0];
    if (firstLocation) setSelection({ kind: 'location', id: firstLocation.id });
    else if (sections[0]) setSelection({ kind: 'section', id: sections[0].id });
    else setSelection(null);
  }, [data, selectionExists, sections]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const term = search.trim().toLowerCase();
  const visibleTree = useMemo(() => {
    if (!term) return sections.map((s) => ({ section: s, locations: s.locations }));
    return sections
      .map((s) => {
        const sectionHit = s.name.toLowerCase().includes(term);
        const locations = s.locations.filter(
          (l) => sectionHit || l.name.toLowerCase().includes(term) || l.subRows.some((r) => r.label.toLowerCase().includes(term))
        );
        return { section: s, locations };
      })
      .filter((x) => x.locations.length > 0 || x.section.name.toLowerCase().includes(term));
  }, [sections, term]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allExpanded = sections.length > 0 && sections.every((s) => !collapsed.has(s.id));
  function toggleAll() {
    setCollapsed(allExpanded ? new Set(sections.map((s) => s.id)) : new Set());
  }

  const selectedSection =
    selection?.kind === 'section'
      ? sections.find((s) => s.id === selection.id)
      : selection?.kind === 'location'
        ? sections.find((s) => s.locations.some((l) => l.id === selection.id))
        : undefined;
  const selectedLocation = selection?.kind === 'location' ? selectedSection?.locations.find((l) => l.id === selection.id) : undefined;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-slate-900">Manage Layout</h3>
            {scopedCampusName && <p className="text-xs text-slate-500 mt-0.5">{scopedCampusName}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setAddingSection((v) => !v)} className={BTN_PRIMARY}>
              + Add section
            </button>
            <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">
              ✕
            </button>
          </div>
        </div>

        {addingSection && (
          <AddSectionBar
            lockedCampusId={campusId}
            campuses={activeCampuses}
            onCancel={() => setAddingSection(false)}
            onCreated={(id) => {
              setAddingSection(false);
              setSelection({ kind: 'section', id });
            }}
          />
        )}

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left: searchable tree */}
          <div className="md:w-80 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col min-h-0 max-h-56 md:max-h-none">
            <div className="p-4 pb-2 space-y-2">
              <input
                className={`${INPUT} w-full`}
                placeholder="Search sections, locations, fields..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="flex items-center gap-2">
                {showCampusFilter && (
                  <select
                    value={campusFilter}
                    onChange={(e) => setCampusFilter(e.target.value)}
                    title="Show only one campus's sections"
                    className={`${INPUT} flex-1 min-w-0 py-1 text-xs`}
                  >
                    <option value="">All campuses</option>
                    {activeCampuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {sections.length > 0 && (
                  <button onClick={toggleAll} className="ml-auto text-xs text-blue-700 hover:underline flex-shrink-0">
                    {allExpanded ? 'Collapse all' : 'Expand all'}
                  </button>
                )}
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4">
              {sections.length === 0 && <p className="px-2 py-4 text-sm text-slate-400">No sections yet. Use “Add section” to get started.</p>}
              {sections.length > 0 && visibleTree.length === 0 && <p className="px-2 py-4 text-sm text-slate-400">Nothing matches “{search.trim()}”.</p>}
              {visibleTree.map(({ section, locations }) => {
                const open = !!term || !collapsed.has(section.id);
                const sectionSelected = selection?.kind === 'section' && selection.id === section.id;
                return (
                  <div key={section.id} className="mb-1">
                    <div className={`flex items-center rounded-lg ${sectionSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <button
                        onClick={() => toggleCollapsed(section.id)}
                        title={open ? 'Collapse' : 'Expand'}
                        className="w-7 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs flex-shrink-0"
                      >
                        <svg viewBox="0 0 20 20" className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor">
                          <path d="M7 4l6 6-6 6V4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setSelection({ kind: 'section', id: section.id })}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 py-2 pr-2 text-left"
                      >
                        <span className={`truncate font-semibold text-sm ${sectionSelected ? 'text-blue-700' : 'text-slate-800'}`}>{section.name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {section.locations.length} location{section.locations.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </div>
                    {open && (
                      <ul className="ml-3.5 pl-2 border-l border-slate-200 mt-0.5 space-y-0.5">
                        {locations.map((loc) => {
                          const selected = selection?.kind === 'location' && selection.id === loc.id;
                          return (
                            <li key={loc.id}>
                              <button
                                onClick={() => setSelection({ kind: 'location', id: loc.id })}
                                className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                                  selected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span className="truncate">{loc.name}</span>
                                <span className="text-xs text-slate-400 font-normal flex-shrink-0">
                                  {loc.subRows.length} field{loc.subRows.length === 1 ? '' : 's'}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                        {locations.length === 0 && <li className="px-3 py-1.5 text-xs text-slate-400">No locations</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right: selected Section / Location */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            {selectedLocation && selectedSection ? (
              <LocationPanel
                key={selectedLocation.id}
                section={selectedSection}
                location={selectedLocation}
                locIndex={selectedSection.locations.findIndex((l) => l.id === selectedLocation.id)}
                locCount={selectedSection.locations.length}
                campusName={campusNameById.get(selectedSection.campusId) ?? 'Unknown campus'}
                mutations={mutations}
                onSelectSection={() => setSelection({ kind: 'section', id: selectedSection.id })}
                onSelectLocation={(id) => setSelection({ kind: 'location', id })}
              />
            ) : selectedSection ? (
              <SectionPanel
                key={selectedSection.id}
                section={selectedSection}
                secIndex={sections.findIndex((s) => s.id === selectedSection.id)}
                secCount={sections.length}
                campuses={activeCampuses}
                campusName={campusNameById.get(selectedSection.campusId) ?? 'Unknown campus'}
                campusKnown={campusNameById.has(selectedSection.campusId)}
                multiCampus={allCampuses.length > 1}
                mutations={mutations}
                onSelectLocation={(id) => setSelection({ kind: 'location', id })}
              />
            ) : (
              <p className="text-sm text-slate-400">Select a section or location on the left to edit it.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose} className={BTN_PRIMARY}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add section ──────────────────────────────────────────────────────────

function AddSectionBar({
  lockedCampusId,
  campuses,
  onCancel,
  onCreated,
}: {
  lockedCampusId: string | null;
  campuses: { id: string; name: string; isDefault: boolean }[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const { addSection } = useLayoutMutations();
  const [name, setName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // With a specific campus already selected there's nothing to choose — new
  // sections just go there. Only "All Campuses" needs an explicit picker.
  const resolvedCampusId = lockedCampusId || campusId || campuses.find((c) => c.isDefault)?.id || '';

  async function submit() {
    if (!name.trim()) return;
    setError(null);
    try {
      const created = (await addSection.mutateAsync({ name: name.trim(), campusId: resolvedCampusId || undefined })) as { id: string };
      onCreated(created.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not add section');
    }
  }

  return (
    <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          autoFocus
          className={`${INPUT} flex-1 min-w-[180px]`}
          placeholder="New section name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {!lockedCampusId && campuses.length > 1 && (
          <select value={resolvedCampusId} onChange={(e) => setCampusId(e.target.value)} className={INPUT}>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button onClick={submit} disabled={!name.trim()} className={BTN_PRIMARY}>
          Add section
        </button>
        <button onClick={onCancel} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// ── Section panel ────────────────────────────────────────────────────────

function Breadcrumb({ parts }: { parts: { label: string; onClick?: () => void }[] }) {
  return (
    <p className="text-sm text-slate-500 mb-1">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-slate-300">/</span>}
          {p.onClick ? (
            <button onClick={p.onClick} className="text-blue-700 hover:underline">
              {p.label}
            </button>
          ) : (
            p.label
          )}
        </span>
      ))}
    </p>
  );
}

function SectionPanel({
  section,
  secIndex,
  secCount,
  campuses,
  campusName,
  campusKnown,
  multiCampus,
  mutations,
  onSelectLocation,
}: {
  section: Section;
  secIndex: number;
  secCount: number;
  campuses: { id: string; name: string }[];
  campusName: string;
  campusKnown: boolean;
  multiCampus: boolean;
  mutations: ReturnType<typeof useLayoutMutations>;
  onSelectLocation: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rowCount = section.locations.reduce((n, l) => n + l.subRows.length, 0);

  async function addLocation() {
    if (!newLocation.trim()) return;
    setError(null);
    try {
      const created = await mutations.addLocation.mutateAsync({ sectionId: section.id, name: newLocation.trim() });
      setNewLocation('');
      onSelectLocation(created.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not add location');
    }
  }

  return (
    <div>
      <Breadcrumb parts={[{ label: campusName }]} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-3xl font-bold text-slate-900">{section.name}</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setEditing((v) => !v)} className={BTN_SECONDARY}>
            ✎ Edit section
          </button>
          <RowMenu
            items={[
              { label: 'Move up', disabled: secIndex === 0, onClick: () => mutations.moveSection.mutate({ id: section.id, direction: 'up' }) },
              { label: 'Move down', disabled: secIndex === secCount - 1, onClick: () => mutations.moveSection.mutate({ id: section.id, direction: 'down' }) },
              {
                label: 'Remove section',
                destructive: true,
                onClick: async () => {
                  if (
                    await confirmRemoval(confirm, {
                      kind: 'section',
                      id: section.id,
                      title: `Remove section "${section.name}"?`,
                      contains: `This also deletes its ${section.locations.length} location${section.locations.length === 1 ? '' : 's'} and ${rowCount} field${rowCount === 1 ? '' : 's'}.`,
                      confirmLabel: 'Remove section',
                    })
                  )
                    mutations.deleteSection.mutate(section.id);
                },
              },
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        {section.locations.length} location{section.locations.length === 1 ? '' : 's'} · {rowCount} field{rowCount === 1 ? '' : 's'}
      </p>

      {editing && (
        <EditForm
          initialName={section.name}
          nameLabel="Section name"
          campuses={multiCampus ? campuses : undefined}
          initialCampusId={section.campusId}
          campusKnown={campusKnown}
          onCancel={() => setEditing(false)}
          onSave={async ({ name, campusId }) => {
            await mutations.updateSection.mutateAsync({
              id: section.id,
              ...(name !== section.name ? { name } : {}),
              ...(campusId && campusId !== section.campusId ? { campusId } : {}),
            });
            setEditing(false);
          }}
        />
      )}

      <h4 className="text-sm font-semibold text-slate-700 mb-2">Locations</h4>
      <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
        {section.locations.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">No locations yet.</p>}
        {section.locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => onSelectLocation(loc.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
          >
            <span className="font-medium text-slate-800">{loc.name}</span>
            <span className="text-xs text-slate-400">
              {loc.subRows.length} field{loc.subRows.length === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={`${INPUT} flex-1`}
          placeholder="e.g. Zone A, Gate 4, Bay 12"
          value={newLocation}
          onChange={(e) => setNewLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLocation()}
        />
        <button onClick={addLocation} disabled={!newLocation.trim()} className={BTN_SECONDARY}>
          + Add location
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// A small Save / Cancel form, shown only while editing — nothing is saved
// until Save. Used for sections (name + campus), locations and fields (name).
function EditForm({
  initialName,
  nameLabel,
  campuses,
  initialCampusId,
  campusKnown = true,
  typeField,
  onSave,
  onCancel,
}: {
  initialName: string;
  nameLabel: string;
  campuses?: { id: string; name: string }[];
  initialCampusId?: string;
  campusKnown?: boolean;
  // Fields only: lets the type be changed. `lockedReason` (when set) disables
  // the picker and says why — a type can't change once shifts have data in it.
  typeField?: { initial: DataType; lockedReason: string | null };
  onSave: (values: { name: string; campusId?: string; dataType?: DataType }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [campusId, setCampusId] = useState(initialCampusId ?? '');
  const [dataType, setDataType] = useState<DataType>(typeField?.initial ?? 'TEXT');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== initialName || (campuses && campusId !== initialCampusId) || (typeField && dataType !== typeField.initial);

  async function save() {
    if (!name.trim() || !changed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), campusId: campuses ? campusId : undefined, dataType: typeField ? dataType : undefined });
    } catch (err: any) {
      setError(err.message ?? 'Could not save');
      setSaving(false);
    }
  }

  return (
    <div
      className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">{nameLabel}</label>
          <input
            autoFocus
            className={`${INPUT} w-full bg-white`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        {campuses && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Campus</label>
            <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className={`${INPUT} bg-white`}>
              {!campusKnown && initialCampusId && <option value={initialCampusId}>Unknown campus</option>}
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {typeField && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
            <select
              value={dataType}
              disabled={!!typeField.lockedReason}
              onChange={(e) => setDataType(e.target.value as DataType)}
              title={typeField.lockedReason ?? undefined}
              className={`${INPUT} bg-white disabled:bg-slate-100 disabled:text-slate-500`}
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DATA_TYPE_INFO[t].label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !name.trim() || !changed} className={BTN_PRIMARY}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} className={BTN_SECONDARY}>
            Cancel
          </button>
        </div>
      </div>
      {typeField?.lockedReason && <p className="text-xs text-slate-500 mt-2">{typeField.lockedReason}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

// ── Location panel ───────────────────────────────────────────────────────

function LocationPanel({
  section,
  location,
  locIndex,
  locCount,
  campusName,
  mutations,
  onSelectSection,
  onSelectLocation,
}: {
  section: Section;
  location: Location;
  locIndex: number;
  locCount: number;
  campusName: string;
  mutations: ReturnType<typeof useLayoutMutations>;
  onSelectSection: () => void;
  onSelectLocation: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onDuplicate() {
    if (!duplicateName.trim()) return;
    setError(null);
    try {
      const created = await mutations.duplicateLocation.mutateAsync({ id: location.id, newName: duplicateName.trim() });
      onSelectLocation(created.id);
    } catch (err: any) {
      setError(err.message ?? 'Could not duplicate location');
    }
  }

  return (
    <div>
      <Breadcrumb parts={[{ label: campusName }, { label: section.name, onClick: onSelectSection }]} />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-3xl font-bold text-slate-900">{location.name}</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setEditing((v) => !v)} className={BTN_SECONDARY}>
            ✎ Edit location
          </button>
          <button onClick={() => setAdding(true)} className={BTN_PRIMARY}>
            + Add field
          </button>
          <RowMenu
            items={[
              { label: 'Duplicate', onClick: () => setDuplicating(true) },
              { label: 'Move up', disabled: locIndex === 0, onClick: () => mutations.moveLocation.mutate({ id: location.id, direction: 'up' }) },
              { label: 'Move down', disabled: locIndex === locCount - 1, onClick: () => mutations.moveLocation.mutate({ id: location.id, direction: 'down' }) },
              {
                label: 'Remove location',
                destructive: true,
                onClick: async () => {
                  if (
                    await confirmRemoval(confirm, {
                      kind: 'location',
                      id: location.id,
                      title: `Remove location "${location.name}"?`,
                      contains: `This also deletes its ${location.subRows.length} field${location.subRows.length === 1 ? '' : 's'}.`,
                      confirmLabel: 'Remove location',
                    })
                  )
                    mutations.deleteLocation.mutate(location.id);
                },
              },
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        {location.subRows.length} field{location.subRows.length === 1 ? '' : 's'}
      </p>

      {editing && (
        <EditForm
          initialName={location.name}
          nameLabel="Location name"
          onCancel={() => setEditing(false)}
          onSave={async ({ name }) => {
            await mutations.updateLocation.mutateAsync({ id: location.id, name });
            setEditing(false);
          }}
        />
      )}

      {duplicating && (
        <div
          className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDuplicating(false);
            }
          }}
        >
          <label className="block text-xs font-medium text-slate-500 mb-1">Name for the copy of “{location.name}”</label>
          <div className="flex gap-2">
            <input
              autoFocus
              className={`${INPUT} flex-1 bg-white`}
              placeholder="New location name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onDuplicate()}
            />
            <button onClick={onDuplicate} disabled={!duplicateName.trim()} className={BTN_PRIMARY}>
              Create copy
            </button>
            <button
              onClick={() => {
                setDuplicating(false);
                setDuplicateName('');
                setError(null);
              }}
              className={BTN_SECONDARY}
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {adding && <AddFieldRow locationId={location.id} onDone={() => setAdding(false)} />}

      <div className="rounded-lg border border-slate-200">
        <div className="grid grid-cols-[1fr_110px_110px_40px] gap-2 items-center bg-slate-50 rounded-t-lg px-4 py-2.5 text-sm font-semibold text-slate-600">
          <span>Field</span>
          <span>Type</span>
          <span>Group field</span>
          <span />
        </div>
        {location.subRows.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">No fields yet — use “Add field”.</p>}
        {location.subRows.map((sr, i) => (
          <FieldRow key={sr.id} subRow={sr} index={i} count={location.subRows.length} mutations={mutations} />
        ))}
      </div>
    </div>
  );
}

function AddFieldRow({ locationId, onDone }: { locationId: string; onDone: () => void }) {
  const { addSubRow } = useLayoutMutations();
  const [label, setLabel] = useState('');
  const [dataType, setDataType] = useState<DataType>('TEXT');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!label.trim()) return;
    setError(null);
    try {
      await addSubRow.mutateAsync({ locationId, label: label.trim(), dataType });
      setLabel('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add field');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="flex gap-2 flex-wrap items-center">
        <input
          autoFocus
          className={`${INPUT} flex-1 min-w-[160px] bg-white`}
          placeholder="Field label, e.g. Skater Coach"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              onDone();
            }
          }}
        />
        <select className={`${INPUT} bg-white`} value={dataType} onChange={(e) => setDataType(e.target.value as DataType)}>
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>
              {DATA_TYPE_INFO[t].label}
            </option>
          ))}
        </select>
        <button onClick={submit} disabled={!label.trim()} className={BTN_PRIMARY}>
          Add
        </button>
        <button onClick={onDone} className={BTN_SECONDARY}>
          Done
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function FieldRow({
  subRow,
  index,
  count,
  mutations,
}: {
  subRow: SubRow;
  index: number;
  count: number;
  mutations: ReturnType<typeof useLayoutMutations>;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const isBadge = subRow.dataType === 'BADGE';
  // The type can only change while no shift has data in this field; check
  // when the form opens so the picker can say so up front.
  const { data: impact } = useQuery<{ filledCells: number }>({
    queryKey: ['layout-impact', 'subrow', subRow.id],
    queryFn: () => api.get(`/layout/impact?kind=subrow&id=${subRow.id}`),
    enabled: editing,
    gcTime: 0,
  });
  const filled = impact?.filledCells ?? 0;
  const lockedReason = !impact ? 'Checking whether this field has data…' : filled > 0 ? `Type is locked: ${filled} shift${filled === 1 ? ' has' : 's have'} data in this field. Add a new field to use a different type.` : null;

  if (editing) {
    return (
      <div className="px-4 py-3 border-t border-slate-100">
        <EditForm
          initialName={subRow.label}
          nameLabel="Field name"
          typeField={{ initial: subRow.dataType, lockedReason }}
          onCancel={() => setEditing(false)}
          onSave={async ({ name, dataType }) => {
            await mutations.updateSubRow.mutateAsync({
              id: subRow.id,
              ...(name !== subRow.label ? { label: name } : {}),
              ...(dataType && dataType !== subRow.dataType ? { dataType } : {}),
            });
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_110px_110px_40px] gap-2 items-center px-4 py-2.5 border-t border-slate-100 text-sm">
      <span className="font-medium text-slate-800 truncate">{subRow.label}</span>
      <span>
        <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{DATA_TYPE_INFO[subRow.dataType].label}</span>
      </span>
      <span>
        {isBadge ? (
          <button
            onClick={() => mutations.updateSubRow.mutate({ id: subRow.id, isGroupField: !subRow.isGroupField })}
            title="Use this field as the Group for the Coach Group Hours report"
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              subRow.isGroupField ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {subRow.isGroupField ? 'Yes' : 'No'}
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </span>
      <RowMenu
        items={[
          { label: 'Edit', onClick: () => setEditing(true) },
          { label: 'Move up', disabled: index === 0, onClick: () => mutations.moveSubRow.mutate({ id: subRow.id, direction: 'up' }) },
          { label: 'Move down', disabled: index === count - 1, onClick: () => mutations.moveSubRow.mutate({ id: subRow.id, direction: 'down' }) },
          {
            label: 'Remove field',
            destructive: true,
            onClick: async () => {
              if (
                await confirmRemoval(confirm, {
                  kind: 'subrow',
                  id: subRow.id,
                  title: `Remove field "${subRow.label}"?`,
                  confirmLabel: 'Remove field',
                })
              )
                mutations.deleteSubRow.mutate(subRow.id);
            },
          },
        ]}
      />
    </div>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────

function RowMenu({ items }: { items: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean }[] }) {
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
    <div ref={ref} className="relative justify-self-end">
      <button
        onClick={() => setOpen((v) => !v)}
        title="More actions"
        className="w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 text-lg leading-none flex items-center justify-center"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-10 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
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
