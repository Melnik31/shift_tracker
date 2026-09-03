import { useState } from 'react';
import { useLayout, useLayoutMutations } from '../hooks/useLayout';
import { useCampuses } from '../hooks/useCampuses';
import { DATA_TYPES, DataType, Location } from '../lib/types';
import { DATA_TYPE_INFO } from '../lib/constants';
import Modal from './Modal';

// campusId mirrors whatever the Matrix's Campus selector is currently set
// to: a specific campus scopes this modal's list to exactly that campus's
// sections (so editing Blaine never shows Plymouth's layout), matching what
// the Matrix itself already shows. null ("All Campuses") shows everything,
// same as the Matrix in that state.
export default function ManageLayoutModal({ onClose, campusId }: { onClose: () => void; campusId: string | null }) {
  const { data } = useLayout(campusId);
  const { data: campusData } = useCampuses();
  const mutations = useLayoutMutations();
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionCampusId, setNewSectionCampusId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Empty by default — every existing location loads collapsed. A newly
  // created or duplicated location's id is added here (see
  // handleLocationCreated) so it opens expanded, since the admin most
  // likely wants to review/adjust it right away. Nothing persists this
  // across opens: the modal unmounts entirely on close (see MatrixView's
  // `{showManageLayout && <ManageLayoutModal .../>}`), so state resets to
  // this default every time it's reopened — there's no existing pattern
  // elsewhere in this app for remembering UI state across a remount.
  const [expandedLocationIds, setExpandedLocationIds] = useState<Set<string>>(new Set());

  function handleLocationCreated(id: string) {
    setExpandedLocationIds((prev) => new Set(prev).add(id));
  }
  function toggleLocationExpanded(id: string) {
    setExpandedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allLocationIds = (data?.sections ?? []).flatMap((s) => s.locations.map((l) => l.id));
  const allExpanded = allLocationIds.length > 0 && allLocationIds.every((id) => expandedLocationIds.has(id));
  function toggleExpandAll() {
    setExpandedLocationIds(allExpanded ? new Set() : new Set(allLocationIds));
  }

  const allCampuses = campusData?.campuses ?? [];
  const activeCampuses = allCampuses.filter((c) => c.active);
  const campusNameById = new Map(allCampuses.map((c) => [c.id, c.name]));
  const scopedCampusName = campusId ? campusNameById.get(campusId) : null;
  // With a specific campus already selected there's nothing to choose — new
  // sections just go there. Only "All Campuses" needs an explicit picker.
  const resolvedCampusId = campusId || newSectionCampusId || activeCampuses.find((c) => c.isDefault)?.id || '';

  async function onAddSection() {
    if (!newSectionName.trim()) return;
    setError(null);
    try {
      await mutations.addSection.mutateAsync({ name: newSectionName.trim(), campusId: resolvedCampusId || undefined });
      setNewSectionName('');
    } catch (err: any) {
      setError(err.message ?? 'Could not add section');
    }
  }

  return (
    <Modal title={scopedCampusName ? `Manage Layout — ${scopedCampusName}` : 'Manage Layout'} onClose={onClose}>
      {allLocationIds.length > 0 && (
        <div className="flex justify-end mb-2">
          <button onClick={toggleExpandAll} className="text-xs text-slate-500 hover:underline">
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      )}
      <div className="space-y-4 mb-6">
        {(data?.sections ?? []).map((section, sIdx, sArr) => (
          <div key={section.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <EditableName
                  value={section.name}
                  onSave={(name) => mutations.updateSection.mutate({ id: section.id, name })}
                  className="font-medium text-slate-800"
                />
                {allCampuses.length > 1 && (
                  <select
                    value={section.campusId}
                    onChange={(e) => mutations.updateSection.mutate({ id: section.id, campusId: e.target.value })}
                    title="Move this section to a different campus"
                    className="text-[10px] uppercase tracking-wide text-slate-400 border-none bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-300 rounded flex-shrink-0"
                  >
                    {!campusNameById.has(section.campusId) && <option value={section.campusId}>Unknown campus</option>}
                    {activeCampuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1">
                <ReorderButtons
                  disabledUp={sIdx === 0}
                  disabledDown={sIdx === sArr.length - 1}
                  onUp={() => mutations.moveSection.mutate({ id: section.id, direction: 'up' })}
                  onDown={() => mutations.moveSection.mutate({ id: section.id, direction: 'down' })}
                />
                <button onClick={() => mutations.deleteSection.mutate(section.id)} className="text-xs text-red-500 hover:underline ml-2">
                  Remove Section
                </button>
              </div>
            </div>

            <div className="pl-3 space-y-3">
              {section.locations.map((location, lIdx, lArr) => (
                <LocationCard
                  key={location.id}
                  location={location}
                  lIdx={lIdx}
                  lArr={section.locations}
                  mutations={mutations}
                  expanded={expandedLocationIds.has(location.id)}
                  onToggleExpand={() => toggleLocationExpanded(location.id)}
                  onLocationCreated={handleLocationCreated}
                />
              ))}

              <AddLocationForm sectionId={section.id} onLocationCreated={handleLocationCreated} />
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-4 space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="New section name"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
          />
          {!campusId && allCampuses.length > 1 && (
            <select
              value={resolvedCampusId}
              onChange={(e) => setNewSectionCampusId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {activeCampuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onAddSection}
            className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700 flex-shrink-0"
          >
            Add Section
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function ReorderButtons({
  disabledUp,
  disabledDown,
  onUp,
  onDown,
}: {
  disabledUp: boolean;
  disabledDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <span className="flex gap-0.5">
      <button disabled={disabledUp} onClick={onUp} className="text-xs px-1 rounded hover:bg-slate-100 disabled:opacity-30">
        ↑
      </button>
      <button disabled={disabledDown} onClick={onDown} className="text-xs px-1 rounded hover:bg-slate-100 disabled:opacity-30">
        ↓
      </button>
    </span>
  );
}

function EditableName({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  return (
    <input
      className={`border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1 ${className ?? ''}`}
      defaultValue={value}
      onBlur={(e) => e.target.value.trim() && e.target.value !== value && onSave(e.target.value.trim())}
    />
  );
}

// A collapsed row still shows every control (reorder/Duplicate/Remove) —
// only the sub-row list and "add sub-row" form are hidden — so nothing an
// admin might need is ever behind an extra click to discover.
function LocationCard({
  location,
  lIdx,
  lArr,
  mutations,
  expanded,
  onToggleExpand,
  onLocationCreated,
}: {
  location: Location;
  lIdx: number;
  lArr: Location[];
  mutations: ReturnType<typeof useLayoutMutations>;
  expanded: boolean;
  onToggleExpand: () => void;
  onLocationCreated: (id: string) => void;
}) {
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  async function onDuplicate() {
    if (!duplicateName.trim()) return;
    setDuplicateError(null);
    try {
      const created = await mutations.duplicateLocation.mutateAsync({ id: location.id, newName: duplicateName.trim() });
      onLocationCreated(created.id);
      setDuplicating(false);
      setDuplicateName('');
    } catch (err: any) {
      setDuplicateError(err.message ?? 'Could not duplicate location');
    }
  }

  return (
    <div className="border-l-2 border-slate-100 pl-3">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onToggleExpand}
            title={expanded ? 'Collapse' : 'Expand'}
            className="text-slate-400 hover:text-slate-700 text-xs w-3 flex-shrink-0"
          >
            {expanded ? '▾' : '▸'}
          </button>
          <EditableName
            value={location.name}
            onSave={(name) => mutations.updateLocation.mutate({ id: location.id, name })}
            className="text-sm font-medium text-slate-700"
          />
          {!expanded && (
            <span className="text-xs text-slate-400 flex-shrink-0">
              — {location.subRows.length} field{location.subRows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <ReorderButtons
            disabledUp={lIdx === 0}
            disabledDown={lIdx === lArr.length - 1}
            onUp={() => mutations.moveLocation.mutate({ id: location.id, direction: 'up' })}
            onDown={() => mutations.moveLocation.mutate({ id: location.id, direction: 'down' })}
          />
          <button onClick={() => setDuplicating((v) => !v)} className="text-xs text-slate-500 hover:underline ml-2">
            Duplicate
          </button>
          <button onClick={() => mutations.deleteLocation.mutate(location.id)} className="text-xs text-red-500 hover:underline ml-2">
            Remove
          </button>
        </div>
      </div>

      {duplicating && (
        <div className="flex gap-2 mb-2">
          <input
            autoFocus
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="New location name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onDuplicate()}
          />
          <button onClick={onDuplicate} className="rounded-md bg-slate-900 text-white px-3 py-1 text-sm font-medium hover:bg-slate-700 flex-shrink-0">
            Create
          </button>
          <button
            onClick={() => {
              setDuplicating(false);
              setDuplicateName('');
              setDuplicateError(null);
            }}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}
      {duplicateError && <p className="text-xs text-red-600 mb-2">{duplicateError}</p>}

      {expanded && (
        <>
          <ul className="space-y-1 mb-2">
            {location.subRows.map((sr, srIdx, srArr) => (
              <li key={sr.id} className="flex items-center justify-between text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <EditableName value={sr.label} onSave={(label) => mutations.updateSubRow.mutate({ id: sr.id, label })} />
                  <span className="text-xs text-slate-400">({DATA_TYPE_INFO[sr.dataType].label})</span>
                </div>
                <div className="flex items-center gap-1">
                  <ReorderButtons
                    disabledUp={srIdx === 0}
                    disabledDown={srIdx === srArr.length - 1}
                    onUp={() => mutations.moveSubRow.mutate({ id: sr.id, direction: 'up' })}
                    onDown={() => mutations.moveSubRow.mutate({ id: sr.id, direction: 'down' })}
                  />
                  <button onClick={() => mutations.deleteSubRow.mutate(sr.id)} className="text-xs text-red-500 hover:underline ml-2">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <AddSubRowForm locationId={location.id} />
        </>
      )}
    </div>
  );
}

function AddLocationForm({ sectionId, onLocationCreated }: { sectionId: string; onLocationCreated: (id: string) => void }) {
  const { addLocation } = useLayoutMutations();
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2">
      <input
        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        placeholder="e.g. Zone A, Gate 4, Bay 12"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        onClick={async () => {
          if (!name.trim()) return;
          const created = await addLocation.mutateAsync({ sectionId, name: name.trim() });
          onLocationCreated(created.id);
          setName('');
        }}
        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
      >
        Add Location
      </button>
    </div>
  );
}

function AddSubRowForm({ locationId }: { locationId: string }) {
  const { addSubRow } = useLayoutMutations();
  const [label, setLabel] = useState('');
  const [dataType, setDataType] = useState<DataType>('TEXT');
  return (
    <div className="flex gap-2 mb-2">
      <input
        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        placeholder="Sub-row label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <select className="rounded-md border border-slate-300 px-1 py-1 text-sm" value={dataType} onChange={(e) => setDataType(e.target.value as DataType)}>
        {DATA_TYPES.map((t) => (
          <option key={t} value={t}>
            {DATA_TYPE_INFO[t].label}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!label.trim()) return;
          addSubRow.mutate({ locationId, label: label.trim(), dataType });
          setLabel('');
        }}
        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
      >
        Add
      </button>
    </div>
  );
}
