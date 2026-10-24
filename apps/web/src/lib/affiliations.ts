import type {
  Affiliation,
  AffiliationStatus,
  CreateAffiliationInput,
  InsuredAffiliation,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export function useInsurers() {
  return useQuery({
    queryKey: ['insurers'],
    queryFn: () => api<{ id: string; name: string }[]>('/insurers'),
    staleTime: 5 * 60_000,
  });
}

const patientBase = (centerId: string, patientId: string) =>
  `/organizations/${centerId}/patients/${patientId}/affiliations`;

export function usePatientAffiliations(centerId: string, patientId: string) {
  return useQuery({
    queryKey: ['affiliations', centerId, patientId],
    queryFn: () => api<Affiliation[]>(patientBase(centerId, patientId)),
  });
}

export function useDeclareAffiliation(centerId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAffiliationInput) =>
      api<Affiliation>(patientBase(centerId, patientId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['affiliations', centerId, patientId] }),
  });
}

export function useWithdrawAffiliation(centerId: string, patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (affiliationId: string) =>
      api<Affiliation>(`${patientBase(centerId, patientId)}/${affiliationId}/withdraw`, {
        method: 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['affiliations', centerId, patientId] }),
  });
}

export function useInsuredAffiliations(insurerId: string, status: AffiliationStatus) {
  return useQuery({
    queryKey: ['insured', insurerId, status],
    queryFn: () =>
      api<InsuredAffiliation[]>(`/organizations/${insurerId}/affiliations?status=${status}`),
  });
}

export function useDecideAffiliation(insurerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reject }: { id: string; reject?: { reason: string } }) =>
      api<Affiliation>(
        `/organizations/${insurerId}/affiliations/${id}/${reject ? 'reject' : 'validate'}`,
        { method: 'POST', body: JSON.stringify(reject ?? {}) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insured', insurerId] }),
  });
}
