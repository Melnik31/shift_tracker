import { useAuth } from '../hooks/useAuth';
import { useCampuses } from '../hooks/useCampuses';

interface Props {
  value: string | null;
  onChange: (campusId: string | null) => void;
}

// ADMIN/CEO get an interactive dropdown ("All Campuses" + every active
// Campus) that narrows Matrix/Dashboard via ?campusId= (see useLayout,
// useShifts, useOverview). DIRECTOR/SENIOR_LEAD_INSTRUCTOR are already
// scoped server-side to their one Campus, so they get a fixed, non-
// interactive label instead — there's nothing for them to select.
export default function CampusSelector({ value, onChange }: Props) {
  const { data: me } = useAuth();
  const isRestricted = me?.admin?.role === 'DIRECTOR' || me?.admin?.role === 'SENIOR_LEAD_INSTRUCTOR';
  const { data } = useCampuses();

  if (isRestricted) {
    return (
      <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
        Campus: {me?.admin?.campus?.name ?? 'None assigned'}
      </span>
    );
  }

  const campuses = (data?.campuses ?? []).filter((c) => c.active);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    >
      <option value="">All Campuses</option>
      {campuses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
