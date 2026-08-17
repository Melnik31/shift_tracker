import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Section, DataType } from '../lib/types';

export function useLayout() {
  return useQuery<{ sections: Section[] }>({
    queryKey: ['layout'],
    queryFn: () => api.get('/layout'),
  });
}

export function useLayoutMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['layout'] });

  const addSection = useMutation({
    mutationFn: (name: string) => api.post('/layout/sections', { name }),
    onSuccess: invalidate,
  });

  const updateSection = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.patch(`/layout/sections/${vars.id}`, { name: vars.name }),
    onSuccess: invalidate,
  });

  const deleteSection = useMutation({
    mutationFn: (id: string) => api.delete(`/layout/sections/${id}`),
    onSuccess: invalidate,
  });

  const moveSection = useMutation({
    mutationFn: (vars: { id: string; direction: 'up' | 'down' }) => api.post(`/layout/sections/${vars.id}/move`, { direction: vars.direction }),
    onSuccess: invalidate,
  });

  const addLocation = useMutation({
    mutationFn: (vars: { sectionId: string; name: string }) => api.post('/layout/locations', vars),
    onSuccess: invalidate,
  });

  const updateLocation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.patch(`/layout/locations/${vars.id}`, { name: vars.name }),
    onSuccess: invalidate,
  });

  const deleteLocation = useMutation({
    mutationFn: (id: string) => api.delete(`/layout/locations/${id}`),
    onSuccess: invalidate,
  });

  const moveLocation = useMutation({
    mutationFn: (vars: { id: string; direction: 'up' | 'down' }) => api.post(`/layout/locations/${vars.id}/move`, { direction: vars.direction }),
    onSuccess: invalidate,
  });

  const addSubRow = useMutation({
    mutationFn: (vars: { locationId: string; label: string; dataType: DataType; config?: object }) => api.post('/layout/subrows', vars),
    onSuccess: invalidate,
  });

  const updateSubRow = useMutation({
    mutationFn: (vars: { id: string; label?: string; config?: object }) => api.patch(`/layout/subrows/${vars.id}`, vars),
    onSuccess: invalidate,
  });

  const deleteSubRow = useMutation({
    mutationFn: (id: string) => api.delete(`/layout/subrows/${id}`),
    onSuccess: invalidate,
  });

  const moveSubRow = useMutation({
    mutationFn: (vars: { id: string; direction: 'up' | 'down' }) => api.post(`/layout/subrows/${vars.id}/move`, { direction: vars.direction }),
    onSuccess: invalidate,
  });

  return {
    addSection,
    updateSection,
    deleteSection,
    moveSection,
    addLocation,
    updateLocation,
    deleteLocation,
    moveLocation,
    addSubRow,
    updateSubRow,
    deleteSubRow,
    moveSubRow,
  };
}
