export interface PreviewLocation {
  name: string;
  fields?: string[];
}
export interface PreviewSection {
  campusId: string;
  name: string;
  locations: PreviewLocation[];
}

const TIMES = ['4 PM', '5 PM', '6 PM'];
const ROW = 'grid grid-cols-[minmax(130px,1.7fr)_repeat(3,1fr)] border-b border-slate-200 last:border-b-0';

// A static, schedule-shaped sketch of the layout being built in the setup
// wizard: campus in the corner cell, time columns, then each section with
// its locations (and, in the Fields step, the fields under each location).
// Purely visual — no shift data.
export default function LayoutPreview({ campuses, sections }: { campuses: { id: string; name: string }[]; sections: PreviewSection[] }) {
  const groups = campuses
    .map((c) => ({ campus: c, sections: sections.filter((s) => s.campusId === c.id && s.name.trim()) }))
    .filter((g) => g.sections.length > 0);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden text-sm bg-white">
      {groups.length === 0 && <p className="px-4 py-10 text-center text-slate-400">Your layout will appear here as you build it.</p>}
      {groups.map(({ campus, sections: secs }) => (
        <div key={campus.id}>
          <div className={`${ROW} bg-slate-100 font-semibold text-slate-700`}>
            <div className="px-4 py-2.5 border-r border-slate-200 truncate">{campus.name}</div>
            {TIMES.map((t) => (
              <div key={t} className="px-3 py-2.5 text-center border-r border-slate-200 last:border-r-0">
                {t}
              </div>
            ))}
          </div>
          {secs.map((section, i) => (
            <div key={`${section.name}-${i}`}>
              <div className={`${ROW} bg-blue-50/70`}>
                <div className="px-3 py-2.5 border-r border-slate-200 flex items-center gap-1.5 font-medium text-slate-800 truncate">
                  <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-500 flex-shrink-0" fill="currentColor" aria-hidden="true">
                    <path d="M5 7l5 6 5-6H5z" />
                  </svg>
                  <span className="truncate">{section.name}</span>
                </div>
                <div className="col-span-3" />
              </div>
              {section.locations
                .filter((l) => l.name.trim())
                .map((loc, j) => (
                  <div key={`${loc.name}-${j}`}>
                    <div className={ROW}>
                      <div className="pl-8 pr-3 py-2.5 border-r border-slate-200 text-slate-700 truncate">{loc.name}</div>
                      <div className="col-span-3" />
                    </div>
                    {loc.fields?.map((f, k) => (
                      <div key={`${f}-${k}`} className={ROW}>
                        <div className="pl-14 pr-3 py-2 border-r border-slate-200 text-slate-500 truncate">{f}</div>
                        <div className="col-span-3" />
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
