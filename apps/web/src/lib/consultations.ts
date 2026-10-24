import type {
  Consultation,
  ConsultationSummary,
  CreateConsultationInput,
  Icd10Code,
  UpdateConsultationInput,
} from '@medical-ins/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
      api<Consultation>(base(centerId), { method: 'POST', body: JSON.stringify(input) }),
  });
}

/** Mutations on one consultation; each answers with the consultation as it now stands. */
function useConsultationMutation<T>(
  centerId: string,
  consultationId: string,
  request: (url: string, input: T) => Promise<Consultation>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: T) => request(`${base(centerId)}/${consultationId}`, input),
    onSuccess: (consultation) => {
      queryClient.setQueryData(['consultations', centerId, consultationId], consultation);
      return queryClient.invalidateQueries({
        queryKey: ['consultations', centerId, 'patient', consultation.patientId],
      });
    },
  });
}

export const useUpdateConsultation = (centerId: string, consultationId: string) =>
  useConsultationMutation(centerId, consultationId, (url, input: UpdateConsultationInput) =>
    api<Consultation>(url, { method: 'PATCH', body: JSON.stringify(input) }),
  );

export const useSignConsultation = (centerId: string, consultationId: string) =>
  useConsultationMutation<void>(centerId, consultationId, (url) =>
    api<Consultation>(`${url}/sign`, { method: 'POST' }),
  );

export const useAddAddendum = (centerId: string, consultationId: string) =>
  useConsultationMutation(centerId, consultationId, (url, content: string) =>
    api<Consultation>(`${url}/addenda`, { method: 'POST', body: JSON.stringify({ content }) }),
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
