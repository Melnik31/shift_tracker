import { DateRange, DateRangePreset, rangeForPreset } from '../lib/dateRange';

const PRESETS: { key: Exclude<DateRangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  function selectPreset(preset: Exclude<DateRangePreset, 'custom'>) {
    onChange({ preset, ...rangeForPreset(preset) });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center border border-slate-300 rounded-md overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => selectPreset(p.key)}
            className={`px-3 py-1.5 text-sm ${value.preset === p.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => onChange({ ...value, preset: 'custom' })}
          className={`px-3 py-1.5 text-sm border-l border-slate-300 ${
            value.preset === 'custom' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Custom range
        </button>
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value, end: value.end < e.target.value ? e.target.value : value.end })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-slate-400 text-sm">–</span>
          <input
            type="date"
            value={value.end}
            min={value.start}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}
    </div>
  );
}
