import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Shift } from '../lib/types';

export function useShifts(date: string) {
  return useQuery<{ shifts: Shift[] }>({
    queryKey: ['shifts', date],
    queryFn: () => api.get(`/shifts?date=${date}`),
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
