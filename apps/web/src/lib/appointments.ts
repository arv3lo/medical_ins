import type { Appointment, AppointmentStatus, CreateAppointmentInput } from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const base = (centerId: string) => `/organizations/${centerId}/appointments`;

type Filter = { from?: string; to?: string; doctorId?: string; patientId?: string };

export function useAppointments(centerId: string, filter: Filter) {
  const params = new URLSearchParams(
    Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return useQuery({
    queryKey: ['appointments', centerId, filter],
    queryFn: () => api<Appointment[]>(`${base(centerId)}?${params}`),
  });
}

export function useDoctors(centerId: string) {
  return useQuery({
    queryKey: ['doctors', centerId],
    queryFn: () => api<{ id: string; fullName: string }[]>(`/organizations/${centerId}/doctors`),
  });
}

export function useBookAppointment(centerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAppointmentInput) =>
      api<Appointment>(base(centerId), { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments', centerId] }),
  });
}

export function useChangeAppointmentStatus(centerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api<Appointment>(`${base(centerId)}/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments', centerId] }),
  });
}
