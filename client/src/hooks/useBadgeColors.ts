import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface SavedBadgeColor {
  id: string;
  color: string;
  createdAt: string;
}

// The workspace-shared "quick pick" palette of custom colors saved from the
// BADGE color picker (see components/CellFieldEditor.tsx) — every admin
// editing badges in this workspace sees the same list.
export function useBadgeColors() {
  return useQuery<{ colors: SavedBadgeColor[] }>({
    queryKey: ['badgeColors'],
    queryFn: () => api.get('/badge-colors'),
  });
}

export function useBadgeColorMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['badgeColors'] });

  const saveColor = useMutation({
    mutationFn: (color: string) => api.post<SavedBadgeColor>('/badge-colors', { color }),
    onSuccess: invalidate,
  });

  const removeColor = useMutation({
    mutationFn: (id: string) => api.delete(`/badge-colors/${id}`),
    onSuccess: invalidate,
  });

  return { saveColor, removeColor };
}
