import type {
  CreatePatientInput,
  Patient,
  PatientSummary,
  UpdatePatientInput,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './api';

const base = (centerId: string) => `/organizations/${centerId}/patients`;

export const patientsKey = (centerId: string, query: string) => ['patients', centerId, query];
export const patientKey = (centerId: string, patientId: string) => ['patient', centerId, patientId];

export function usePatients(centerId: string, query: string) {
  return useQuery({
    queryKey: patientsKey(centerId, query),
    queryFn: () => api<Patient[]>(`${base(centerId)}?q=${encodeURIComponent(query)}`),
    placeholderData: (previous) => previous,
  });
}

export function usePatient(centerId: string, patientId: string) {
  return useQuery({
    queryKey: patientKey(centerId, patientId),
    queryFn: () => api<Patient>(`${base(centerId)}/${patientId}`),
  });
}

export function useCreatePatient(centerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePatientInput) =>
      api<Patient>(base(centerId), { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients', centerId] }),
  });
}

export function useLinkPatient(centerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patientId: string) =>
      api<void>(`${base(centerId)}/${patientId}/link`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patients', centerId] }),
  });
}

export function useUpdatePatient(centerId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePatientInput) =>
      api<Patient>(`${base(centerId)}/${patientId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (patient) => {
      queryClient.setQueryData(patientKey(centerId, patientId), patient);
      return queryClient.invalidateQueries({ queryKey: ['patients', centerId] });
    },
  });
}

/** The duplicates a 409 from patient creation carries, if that is what the error is. */
export function duplicatesOf(
  error: Error | null,
): { message: string; duplicates: PatientSummary[]; sameNationalId: boolean } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const duplicates = error.details.duplicates as PatientSummary[] | undefined;
  if (!duplicates?.length) return null;
  return {
    message: error.message,
    duplicates,
    sameNationalId: error.details.sameNationalId === true,
  };
}
