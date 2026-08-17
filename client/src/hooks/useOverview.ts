import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { RangeOverview } from '../lib/types';

export function useOverview(start: string, end: string) {
  return useQuery<RangeOverview>({
    queryKey: ['overview', start, end],
    queryFn: () => api.get(`/analytics/overview?start=${start}&end=${end}`),
  });
}
