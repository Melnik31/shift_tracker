import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { RangeOverview } from '../lib/types';

// campusId narrows the overview to one Campus (the Campus selector) — has
// no effect for a restricted Director/SLI, whose own session scope always
// wins server-side; see campusScopeFor in server/src/lib/campusScope.ts.
export function useOverview(start: string, end: string, campusId?: string | null) {
  return useQuery<RangeOverview>({
    queryKey: ['overview', start, end, campusId ?? null],
    queryFn: () => api.get(`/analytics/overview?start=${start}&end=${end}${campusId ? `&campusId=${campusId}` : ''}`),
  });
}
