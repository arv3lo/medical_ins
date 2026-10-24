import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

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
});
