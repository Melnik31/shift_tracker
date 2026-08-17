import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

export interface MeResponse {
  actorType: 'admin' | 'employee';
  admin?: { id: string; email: string } | null;
  employee?: { id: string; name: string; role: string } | null;
  workspace: { id: string; name: string; workspaceCode?: string; onboardingStep?: number };
}

export function useAuth() {
  const queryClient = useQueryClient();

  const query = useQuery<MeResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
  });

  async function logout() {
    await api.post('/auth/logout');
    queryClient.setQueryData(['me'], null);
    queryClient.clear();
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }

  return { ...query, logout, refresh };
}
