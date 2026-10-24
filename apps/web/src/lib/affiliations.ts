import {
  INSURED_PAGE_SIZE,
  type Affiliation,
  type AffiliationStatus,
  type CreateAffiliationInput,
  type InsuredAffiliation,
} from '@medical-ins/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export const insuredKey = (insurerId: string, status: AffiliationStatus, memberNumber: string) =>
  ['insured', insurerId, status, memberNumber] as const;

/** The API sends pages of INSURED_PAGE_SIZE: a shorter page is the last one. */
export const nextInsuredOffset = (lastPage: InsuredAffiliation[], pages: InsuredAffiliation[][]) =>
  lastPage.length < INSURED_PAGE_SIZE ? undefined : pages.length * INSURED_PAGE_SIZE;

/** The insurer's list, page by page; `memberNumber` is a prefix, empty for all. */
export function useInsuredAffiliations(
  insurerId: string,
  status: AffiliationStatus,
  memberNumber: string,
) {
  return useInfiniteQuery({
    queryKey: insuredKey(insurerId, status, memberNumber),
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ status, offset: String(pageParam) });
      if (memberNumber) query.set('memberNumber', memberNumber);
      return api<InsuredAffiliation[]>(`/organizations/${insurerId}/affiliations?${query}`);
    },
    initialPageParam: 0,
    getNextPageParam: nextInsuredOffset,
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
