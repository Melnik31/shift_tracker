import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Employee } from '../lib/types';

// campusId narrows the roster to one Campus (plus floating employees — see
// the Employee.campusId schema comment) — has no effect for a restricted
// Director/SLI, whose own session scope always wins server-side. Mirrors
// useLayout's campusId pattern.
export function useEmployees(campusId?: string | null) {
  return useQuery<{ employees: Employee[] }>({
    queryKey: ['employees', campusId ?? null],
    queryFn: () => api.get(`/employees${campusId ? `?campusId=${campusId}` : ''}`),
  });
}

export function useEmployeeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

  const addEmployee = useMutation({
    mutationFn: (vars: { name: string; role: string; pin: string; campusId?: string }) => api.post('/employees', vars),
    onSuccess: invalidate,
  });

  const updateEmployee = useMutation({
    mutationFn: (vars: { id: string; name?: string; role?: string; pin?: string; campusId?: string | null }) =>
      api.patch(`/employees/${vars.id}`, vars),
    onSuccess: invalidate,
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: invalidate,
  });

  return { addEmployee, updateEmployee, deleteEmployee };
}
