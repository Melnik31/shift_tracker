import { useState } from 'react';
import { useLayout, useLayoutMutations } from '../hooks/useLayout';
import { DATA_TYPES, DataType } from '../lib/types';
import Modal from './Modal';

export default function ManageLayoutModal({ onClose }: { onClose: () => void }) {
  const { data } = useLayout();
  const mutations = useLayoutMutations();
  const [newSectionName, setNewSectionName] = useState('');

  return (
    <Modal title="Manage Layout" onClose={onClose}>
      <div className="space-y-4 mb-6">
        {(data?.sections ?? []).map((section, sIdx, sArr) => (
          <div key={section.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <EditableName
                value={section.name}
                onSave={(name) => mutations.updateSection.mutate({ id: section.id, name })}
                className="font-medium text-slate-800"
              />
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
                <div key={location.id} className="border-l-2 border-slate-100 pl-3">
                  <div className="flex items-center justify-between mb-1">
                    <EditableName
                      value={location.name}
                      onSave={(name) => mutations.updateLocation.mutate({ id: location.id, name })}
                      className="text-sm font-medium text-slate-700"
                    />
                    <div className="flex items-center gap-1">
                      <ReorderButtons
                        disabledUp={lIdx === 0}
                        disabledDown={lIdx === lArr.length - 1}
                        onUp={() => mutations.moveLocation.mutate({ id: location.id, direction: 'up' })}
                        onDown={() => mutations.moveLocation.mutate({ id: location.id, direction: 'down' })}
                      />
                      <button onClick={() => mutations.deleteLocation.mutate(location.id)} className="text-xs text-red-500 hover:underline ml-2">
                        Remove
                      </button>
                    </div>
                  </div>

                  <ul className="space-y-1 mb-2">
                    {location.subRows.map((sr, srIdx, srArr) => (
                      <li key={sr.id} className="flex items-center justify-between text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <EditableName value={sr.label} onSave={(label) => mutations.updateSubRow.mutate({ id: sr.id, label })} />
                          <span className="text-xs text-slate-400">({sr.dataType})</span>
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
                </div>
              ))}

              <AddLocationForm sectionId={section.id} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t border-slate-200 pt-4">
        <input
          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="New section name"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
        />
        <button
          onClick={() => {
            if (!newSectionName.trim()) return;
            mutations.addSection.mutate(newSectionName.trim());
            setNewSectionName('');
          }}
          className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-700"
        >
          Add Section
        </button>
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

function AddLocationForm({ sectionId }: { sectionId: string }) {
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
        onClick={() => {
          if (!name.trim()) return;
          addLocation.mutate({ sectionId, name: name.trim() });
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
            {t}
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
