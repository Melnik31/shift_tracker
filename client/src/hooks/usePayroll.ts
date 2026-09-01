import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PayrollAdjustment, PayrollPeriod, PayrollPeriodDetail, PayrollPeriodReopen } from '../lib/types';

export function usePayrollPeriods() {
  return useQuery<{ periods: PayrollPeriod[] }>({
    queryKey: ['payroll', 'periods'],
    queryFn: () => api.get('/payroll/periods'),
  });
}

export function usePayrollPeriodDetail(periodId: string | null) {
  return useQuery<PayrollPeriodDetail>({
    queryKey: ['payroll', 'period', periodId],
    queryFn: () => api.get(`/payroll/periods/${periodId}`),
    enabled: !!periodId,
  });
}

export function usePayrollAdjustments(periodId: string | null) {
  return useQuery<{ adjustments: PayrollAdjustment[] }>({
    queryKey: ['payroll', 'adjustments', periodId],
    queryFn: () => api.get(`/payroll/periods/${periodId}/adjustments`),
    enabled: !!periodId,
  });
}

export function usePayrollReopens(periodId: string | null) {
  return useQuery<{ reopens: PayrollPeriodReopen[] }>({
    queryKey: ['payroll', 'reopens', periodId],
    queryFn: () => api.get(`/payroll/periods/${periodId}/reopens`),
    enabled: !!periodId,
  });
}

export function usePayrollMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payroll'] });

  const createPeriod = useMutation({
    mutationFn: (vars: { start: string; end: string }) => api.post<PayrollPeriod>('/payroll/periods', vars),
    onSuccess: invalidate,
  });

  const markReviewed = useMutation({
    mutationFn: (periodId: string) => api.post(`/payroll/periods/${periodId}/review`),
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: (periodId: string) => api.post(`/payroll/periods/${periodId}/approve`),
    onSuccess: invalidate,
  });

  const createAdjustment = useMutation({
    mutationFn: (vars: { periodId: string; employeeId: string; deltaMinutes: number; reason: string }) =>
      api.post(`/payroll/periods/${vars.periodId}/adjustments`, vars),
    onSuccess: invalidate,
  });

  const reopenPeriod = useMutation({
    mutationFn: (vars: { periodId: string; reason: string }) => api.post(`/payroll/periods/${vars.periodId}/reopen`, { reason: vars.reason }),
    onSuccess: invalidate,
  });

  const deletePeriod = useMutation({
    mutationFn: (periodId: string) => api.delete(`/payroll/periods/${periodId}`),
    onSuccess: invalidate,
  });

  return { createPeriod, markReviewed, approve, createAdjustment, reopenPeriod, deletePeriod };
}
