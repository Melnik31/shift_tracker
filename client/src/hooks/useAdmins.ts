import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { AdminUserAccount } from '../lib/types';

export function useAdmins() {
  return useQuery<{ admins: AdminUserAccount[] }>({
    queryKey: ['admins'],
    queryFn: () => api.get('/admin-users'),
  });
}

export function useAdminMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admins'] });

  const addAdmin = useMutation({
    mutationFn: (vars: { name?: string; email: string; password: string; role: string; campusId?: string }) => api.post('/admin-users', vars),
    onSuccess: invalidate,
  });

  // role is deliberately not accepted here — the server rejects it. Use
  // changeRole below, which requires a reason and is audited.
  const updateAdmin = useMutation({
    mutationFn: (vars: { id: string; email?: string; password?: string; campusId?: string }) => api.patch(`/admin-users/${vars.id}`, vars),
    onSuccess: invalidate,
  });

  const changeRole = useMutation({
    mutationFn: (vars: { id: string; newRole: string; campusId?: string; reason: string }) => api.patch(`/admin-users/${vars.id}/role`, vars),
    onSuccess: invalidate,
  });

  const deactivateAdmin = useMutation({
    mutationFn: (id: string) => api.post(`/admin-users/${id}/deactivate`),
    onSuccess: invalidate,
  });

  const activateAdmin = useMutation({
    mutationFn: (id: string) => api.post(`/admin-users/${id}/activate`),
    onSuccess: invalidate,
  });

  return { addAdmin, updateAdmin, changeRole, deactivateAdmin, activateAdmin };
}
