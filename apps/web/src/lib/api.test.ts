import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps headers given as a Headers instance and adds the JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await api('/x', { method: 'POST', body: '{}', headers: new Headers({ 'x-test': '1' }) });

    const headers = new Headers(fetchMock.mock.calls[0]![1].headers);
    expect(headers.get('x-test')).toBe('1');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('keeps the extra fields of an error body for the caller', async () => {
    const body = { message: 'Ce patient semble déjà enregistré', duplicates: [{ id: '1' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 409 })));

    const error = await api('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual(body);
  });
});
