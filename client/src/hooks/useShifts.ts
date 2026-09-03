import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BulkShiftRequest, BulkShiftResponse, Shift } from '../lib/types';

// campusId narrows the view to one Campus (the Campus selector) — has no
// effect for a restricted Director/SLI, whose own session scope always wins
// server-side. useShiftMutations' invalidate({queryKey: ['shifts', date]})
// still matches every campusId variant of this key (React Query's default
// partial-match invalidation), so it doesn't need to know about campusId.
export function useShifts(date: string, campusId?: string | null) {
  return useQuery<{ shifts: Shift[] }>({
    queryKey: ['shifts', date, campusId ?? null],
    queryFn: () => api.get(`/shifts?date=${date}${campusId ? `&campusId=${campusId}` : ''}`),
  });
}

export function useShiftMutations(date: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shifts', date] });

  const addShift = useMutation({
    mutationFn: (vars: { subRowId: string; date: string; startTime: string; endTime: string }) => api.post<Shift>('/shifts', vars),
    onSuccess: invalidate,
  });

  const deleteShift = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: invalidate,
  });

  return { addShift, deleteShift, invalidate };
}

// Not tied to a fixed date (like useShiftMutations is) because the "New
// Shift Block" composer lets the date be changed independently of whatever
// date the Matrix is currently viewing — invalidation targets whichever
// date was actually submitted.
export function useBulkShiftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: BulkShiftRequest) => api.post<BulkShiftResponse>('/shifts/bulk', vars),
    onSuccess: (_data, vars) => queryClient.invalidateQueries({ queryKey: ['shifts', vars.date] }),
  });
}
