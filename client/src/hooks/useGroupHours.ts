import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface GroupHoursBreakdown {
  group: string;
  color: string | null;
  hours: number;
  shiftCount: number;
}

export interface GroupHoursResult {
  employee: { id: string; name: string };
  start: string;
  end: string;
  totalHours: number;
  groups: GroupHoursBreakdown[];
}

export function useGroupHours(employeeId: string | null, start: string, end: string, campusId?: string | null) {
  return useQuery<GroupHoursResult>({
    queryKey: ['group-hours', employeeId, start, end, campusId ?? null],
    queryFn: () =>
      api.get(`/analytics/group-hours?employeeId=${employeeId}&start=${start}&end=${end}${campusId ? `&campusId=${campusId}` : ''}`),
    enabled: !!employeeId,
  });
}
