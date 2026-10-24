export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'Authentification requise');
export const forbidden = () => new HttpError(403, 'Accès refusé');
export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);
