export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    /** Extra fields sent next to `message`, for a client that can act on them. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'Authentification requise');
export const forbidden = () => new HttpError(403, 'Accès refusé');
export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);
