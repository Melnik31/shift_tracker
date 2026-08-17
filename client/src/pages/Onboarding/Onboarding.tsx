import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useLayout, useLayoutMutations } from '../../hooks/useLayout';
import { DATA_TYPES, DataType } from '../../lib/types';

const STEP_LABELS = ['Workspace', 'Sections & Locations', 'Sub-Rows'];

export default function Onboarding() {
  const { data: me } = useAuth();
  const startStep = Math.min(Math.max(me?.workspace.onboardingStep ?? 0, 0), 2) + 1;
  const [step, setStep] = useState(startStep);
  const navigate = useNavigate();

  async function goToStep(next: number) {
    await api.patch('/layout/onboarding-step', { step: next - 1 });
    setStep(next);
  }

  async function finish() {
    await api.patch('/layout/onboarding-step', { step: 3 });
    navigate('/matrix');
  }

  async function skip() {
    await api.post('/layout/skip-onboarding');
    navigate('/matrix');
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-slate-800">Set up {me?.workspace.name}</h1>
          <button onClick={skip} className="text-sm text-slate-500 hover:underline">
            Skip setup (use defaults)
          </button>
        </div>

        <ol className="flex gap-4 mb-8 text-sm">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={`flex items-center gap-2 ${i + 1 === step ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  i + 1 === step ? 'bg-slate-900 text-white' : i + 1 < step ? 'bg-slate-300 text-slate-700' : 'bg-slate-200'
                }`}
              >
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {step === 1 && <StepWorkspace onNext={() => goToStep(2)} />}
          {step === 2 && <StepSectionsLocations onBack={() => setStep(1)} onNext={() => goToStep(3)} />}
          {step === 3 && <StepSubRows onBack={() => setStep(2)} onFinish={finish} />}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: workspace name + code ─────────────────────────────────────────

function StepWorkspace({ onNext }: { onNext: () => void }) {
  const { data: me, refresh } = useAuth();
  const [name, setName] = useState(me?.workspace.name ?? '');
  const [code, setCode] = useState(me?.workspace.workspaceCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    setError(null);
    setSaving(true);
    try {
      await api.patch('/layout/workspace', { name, workspaceCode: code });
      await refresh();
      onNext();
    } catch (e: any) {
      setError(e.message ?? 'Could not save workspace');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-800 mb-1">Name your workspace</h2>
      <p className="text-sm text-slate-500 mb-6">Your team will use the workspace code to log in. This can be anything — no industry template required.</p>

      <label className="block text-sm font-medium text-slate-600 mb-1">Workspace Name</label>
      <input
        className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="block text-sm font-medium text-slate-600 mb-1">Workspace Code</label>
      <input
        className="w-full mb-4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={saving || !name || !code}
          className="rounded-md bg-slate-900 text-white px-5 py-2 font-medium hover:bg-slate-700 transition disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Step 2: sections + locations ─────────────────────────────────────────

function StepSectionsLocations({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { data } = useLayout();
  const { addSection, addLocation, deleteSection, deleteLocation } = useLayoutMutations();
  const [newSection, setNewSection] = useState('');
  const [newLocation, setNewLocation] = useState<Record<string, string>>({});

  const sections = data?.sections ?? [];
  const totalLocations = sections.reduce((n, s) => n + s.locations.length, 0);

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-800 mb-1">Add your Sections and Locations</h2>
      <p className="text-sm text-slate-500 mb-6">
        A Section groups related Locations — e.g. "Zone A" or "Ward 3". A Location is a specific spot within it —
        e.g. "Gate 4" or "Bay 12". Use whatever terms fit your operation.
      </p>

      <div className="space-y-4 mb-6">
        {sections.map((section) => (
          <div key={section.id} className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-700">{section.name}</h3>
              <button onClick={() => deleteSection.mutate(section.id)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
            <ul className="space-y-1 mb-3">
              {section.locations.map((loc) => (
                <li key={loc.id} className="flex items-center justify-between text-sm text-slate-600 pl-2">
                  <span>• {loc.name}</span>
                  <button onClick={() => deleteLocation.mutate(loc.id)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="e.g. Gate 4, Bay 12, ICU Wing"
                value={newLocation[section.id] ?? ''}
                onChange={(e) => setNewLocation({ ...newLocation, [section.id]: e.target.value })}
              />
              <button
                onClick={() => {
                  const name = newLocation[section.id]?.trim();
                  if (!name) return;
                  addLocation.mutate({ sectionId: section.id, name });
                  setNewLocation({ ...newLocation, [section.id]: '' });
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Add Location
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="e.g. Zone A, Perimeter, Stages"
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
        />
        <button
          onClick={() => {
            if (!newSection.trim()) return;
            addSection.mutate(newSection.trim());
            setNewSection('');
          }}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Add Section
        </button>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="rounded-md px-5 py-2 font-medium text-slate-600 hover:bg-slate-50">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={totalLocations === 0}
          className="rounded-md bg-slate-900 text-white px-5 py-2 font-medium hover:bg-slate-700 transition disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Step 3: sub-rows per location ────────────────────────────────────────

function StepSubRows({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const { data } = useLayout();
  const { addSubRow, deleteSubRow } = useLayoutMutations();
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({});
  const [typeDraft, setTypeDraft] = useState<Record<string, DataType>>({});

  const locations = (data?.sections ?? []).flatMap((s) => s.locations.map((loc) => ({ ...loc, sectionName: s.name })));

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-800 mb-1">Add Sub-Rows to each Location</h2>
      <p className="text-sm text-slate-500 mb-6">
        Sub-Rows are the actual data fields shown in the matrix (a badge, an assigned-staff list, a status, etc).
        Each has a data type that controls how it's edited and displayed.
      </p>

      <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
        {locations.map((loc) => (
          <div key={loc.id} className="border border-slate-200 rounded-lg p-4">
            <h3 className="font-medium text-slate-700 mb-2">
              {loc.sectionName} / {loc.name}
            </h3>
            <ul className="space-y-1 mb-3">
              {loc.subRows.map((sr) => (
                <li key={sr.id} className="flex items-center justify-between text-sm text-slate-600 pl-2">
                  <span>
                    • {sr.label} <span className="text-xs text-slate-400">({sr.dataType})</span>
                  </span>
                  <button onClick={() => deleteSubRow.mutate(sr.id)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="e.g. Assigned Staff, Priority, Notes"
                value={labelDraft[loc.id] ?? ''}
                onChange={(e) => setLabelDraft({ ...labelDraft, [loc.id]: e.target.value })}
              />
              <select
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={typeDraft[loc.id] ?? 'TEXT'}
                onChange={(e) => setTypeDraft({ ...typeDraft, [loc.id]: e.target.value as DataType })}
              >
                {DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const label = labelDraft[loc.id]?.trim();
                  if (!label) return;
                  addSubRow.mutate({ locationId: loc.id, label, dataType: typeDraft[loc.id] ?? 'TEXT' });
                  setLabelDraft({ ...labelDraft, [loc.id]: '' });
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="rounded-md px-5 py-2 font-medium text-slate-600 hover:bg-slate-50">
          Back
        </button>
        <button onClick={onFinish} className="rounded-md bg-slate-900 text-white px-5 py-2 font-medium hover:bg-slate-700 transition">
          Finish Setup
        </button>
      </div>
    </div>
  );
}
