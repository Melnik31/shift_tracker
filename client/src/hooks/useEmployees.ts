import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Employee } from '../lib/types';

export function useEmployees() {
  return useQuery<{ employees: Employee[] }>({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees'),
  });
}

export function useEmployeeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

  const addEmployee = useMutation({
    mutationFn: (vars: { name: string; role: string; pin: string }) => api.post('/employees', vars),
    onSuccess: invalidate,
  });

  const updateEmployee = useMutation({
    mutationFn: (vars: { id: string; name?: string; role?: string; pin?: string }) => api.patch(`/employees/${vars.id}`, vars),
    onSuccess: invalidate,
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: invalidate,
  });

  return { addEmployee, updateEmployee, deleteEmployee };
}
