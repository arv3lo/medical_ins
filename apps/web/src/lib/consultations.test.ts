import { MutationObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { testQueryClient } from '@/test/render';
import { CENTER_A } from '@/test/users';
import { consultationMutation } from './consultations';

describe('consultationMutation', () => {
  it('reads the consultation and its list back after a write, through the audited GETs', async () => {
    const queryClient = testQueryClient();
    const consultationKey = ['consultations', CENTER_A, 'c1'];
    const listKey = ['consultations', CENTER_A, 'patient', 'p1'];
    queryClient.setQueryData(consultationKey, { id: 'c1', patientId: 'p1' });
    queryClient.setQueryData(listKey, []);

    // Writes answer with ids only, never with the medical content.
    const mutation = new MutationObserver(
      queryClient,
      consultationMutation(queryClient, CENTER_A, 'c1', async () => ({ id: 'c1' })),
    );
    await mutation.mutate(undefined);

    expect(queryClient.getQueryState(consultationKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
