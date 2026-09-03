import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Section, DataType, Location } from '../lib/types';

// campusId narrows the view to one Campus (the Campus selector) — has no
// effect for a restricted Director/SLI, whose own session scope always wins
// server-side. useLayoutMutations' invalidate({queryKey: ['layout']}) still
// matches every campusId variant of this key (React Query's default
// partial-match invalidation), so it doesn't need to know about campusId.
export function useLayout(campusId?: string | null) {
  return useQuery<{ sections: Section[] }>({
    queryKey: ['layout', campusId ?? null],
    queryFn: () => api.get(`/layout${campusId ? `?campusId=${campusId}` : ''}`),
  });
}

export function useLayoutMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['layout'] });

  const addSection = useMutation({
    mutationFn: (vars: { name: string; campusId?: string }) => api.post('/layout/sections', vars),
    onSuccess: invalidate,
  });

  const updateSection = useMutation({
    mutationFn: (vars: { id: string; name?: string; campusId?: string }) => api.patch(`/layout/sections/${vars.id}`, vars),
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
    // Server returns the bare Location (no subRows include, unlike duplicate below).
    mutationFn: (vars: { sectionId: string; name: string }) => api.post<Pick<Location, 'id'>>('/layout/locations', vars),
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

  // Copies a Location's SubRow structure (not its Shift/CellValue data) onto
  // a brand-new Location — lets an admin build one location from another
  // instead of re-entering every sub-row by hand. See ManageLayoutModal.
  const duplicateLocation = useMutation({
    mutationFn: (vars: { id: string; newName: string }) => api.post<Location>(`/layout/locations/${vars.id}/duplicate`, { newName: vars.newName }),
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
    duplicateLocation,
    addSubRow,
    updateSubRow,
    deleteSubRow,
    moveSubRow,
  };
}
