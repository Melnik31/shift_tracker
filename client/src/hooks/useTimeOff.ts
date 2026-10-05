import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: TimeOffStatus;
  decisionNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface TimeOffConflict {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  subRowLabel: string;
}

export interface AdminTimeOffRequest extends TimeOffRequest {
  employee: { id: string; name: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
  conflicts: TimeOffConflict[];
}

// ── Coach side ───────────────────────────────────────────────────────────

export function useMyTimeOff() {
  return useQuery<{ requests: TimeOffRequest[] }>({
    queryKey: ['my-time-off'],
    queryFn: () => api.get('/my/time-off'),
  });
}

export function useMyTimeOffMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-time-off'] });

  const create = useMutation({
    mutationFn: (vars: { startDate: string; endDate: string; reason?: string }) => api.post<TimeOffRequest>('/my/time-off', vars),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/my/time-off/${id}/cancel`, {}),
    onSuccess: invalidate,
  });
  return { create, cancel };
}

// ── Admin side ───────────────────────────────────────────────────────────

export function useTimeOffRequests(status: TimeOffStatus) {
  return useQuery<{ requests: AdminTimeOffRequest[] }>({
    queryKey: ['time-off', 'list', status],
    queryFn: () => api.get(`/time-off?status=${status}`),
  });
}

// Drives the "Requests" nav badge — polls so a new request shows up without
// a reload.
export function usePendingTimeOffCount(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: ['time-off', 'pending-count'],
    queryFn: () => api.get('/time-off/pending-count'),
    refetchInterval: 60_000,
    enabled,
  });
}

export function useTimeOffDecisions() {
  const queryClient = useQueryClient();
  // Refreshes every list, the badge count, and the staff pickers' "off" sets.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['time-off'] });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/time-off/${id}/approve`, {}),
    onSuccess: invalidate,
  });
  const deny = useMutation({
    mutationFn: (vars: { id: string; note?: string }) => api.post(`/time-off/${vars.id}/deny`, { note: vars.note }),
    onSuccess: invalidate,
  });
  return { approve, deny };
}

// Employee ids with approved time off covering `date` — the staff picker
// grays these out. campusId only keys the cache alongside the roster query.
export function useEmployeesOff(date: string | undefined, campusId?: string | null) {
  const { data } = useQuery<{ employeeIds: string[] }>({
    queryKey: ['time-off', 'off', date, campusId ?? null],
    queryFn: () => api.get(`/time-off/off?date=${date}`),
    enabled: !!date,
  });
  return useMemo(() => new Set(data?.employeeIds ?? []), [data]);
}
