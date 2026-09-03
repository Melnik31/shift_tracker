import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Campus } from '../lib/types';

export function useCampuses() {
  return useQuery<{ campuses: Campus[] }>({
    queryKey: ['campuses'],
    queryFn: () => api.get('/campuses'),
  });
}

export function useCampusMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['campuses'] });

  const addCampus = useMutation({
    mutationFn: (name: string) => api.post('/campuses', { name }),
    onSuccess: invalidate,
  });

  const updateCampus = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.patch(`/campuses/${vars.id}`, { name: vars.name }),
    onSuccess: invalidate,
  });

  const setDefaultCampus = useMutation({
    mutationFn: (id: string) => api.post(`/campuses/${id}/set-default`),
    onSuccess: invalidate,
  });

  const deactivateCampus = useMutation({
    mutationFn: (id: string) => api.post(`/campuses/${id}/deactivate`),
    onSuccess: invalidate,
  });

  const activateCampus = useMutation({
    mutationFn: (id: string) => api.post(`/campuses/${id}/activate`),
    onSuccess: invalidate,
  });

  return { addCampus, updateCampus, setDefaultCampus, deactivateCampus, activateCampus };
}
