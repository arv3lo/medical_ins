import type {
  Addendum,
  Consultation,
  ConsultationSummary,
  CreateConsultationInput,
  Icd10Code,
  UpdateConsultationInput,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api';

const base = (centerId: string) => `/organizations/${centerId}/consultations`;

export function usePatientConsultations(centerId: string, patientId: string) {
  return useQuery({
    queryKey: ['consultations', centerId, 'patient', patientId],
    queryFn: () =>
      api<ConsultationSummary[]>(`/organizations/${centerId}/patients/${patientId}/consultations`),
  });
}

export function useConsultation(centerId: string, consultationId: string) {
  return useQuery({
    queryKey: ['consultations', centerId, consultationId],
    queryFn: () => api<Consultation>(`${base(centerId)}/${consultationId}`),
  });
}

export function useStartConsultation(centerId: string) {
  return useMutation({
    mutationFn: (input: CreateConsultationInput) =>
      api<{ id: string }>(base(centerId), { method: 'POST', body: JSON.stringify(input) }),
  });
}

/**
 * Mutations on one consultation. The API answers with ids only, never the medical content, so
 * the consultation and the lists of this center are read back through the GETs, which audit
 * each read.
 */
export function consultationMutation<T, R>(
  queryClient: QueryClient,
  centerId: string,
  consultationId: string,
  request: (url: string, input: T) => Promise<R>,
) {
  return {
    mutationFn: (input: T) => request(`${base(centerId)}/${consultationId}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consultations', centerId] }),
  };
}

function useConsultationMutation<T, R>(
  centerId: string,
  consultationId: string,
  request: (url: string, input: T) => Promise<R>,
) {
  const queryClient = useQueryClient();
  return useMutation(consultationMutation(queryClient, centerId, consultationId, request));
}

export const useUpdateConsultation = (centerId: string, consultationId: string) =>
  useConsultationMutation(centerId, consultationId, (url, input: UpdateConsultationInput) =>
    api<{ id: string }>(url, { method: 'PATCH', body: JSON.stringify(input) }),
  );

export const useSignConsultation = (centerId: string, consultationId: string) =>
  useConsultationMutation<void, { id: string; signedAt: string }>(centerId, consultationId, (url) =>
    api(`${url}/sign`, { method: 'POST' }),
  );

export const useAddAddendum = (centerId: string, consultationId: string) =>
  useConsultationMutation(centerId, consultationId, (url, content: string) =>
    api<Addendum>(`${url}/addenda`, { method: 'POST', body: JSON.stringify({ content }) }),
  );

export function useIcd10Search(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['icd10', q],
    queryFn: () => api<Icd10Code[]>(`/referentials/icd10?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: Infinity,
  });
}
