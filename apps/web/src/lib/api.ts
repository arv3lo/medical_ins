export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.message ?? response.statusText);
  return body as T;
}
