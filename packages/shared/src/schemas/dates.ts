import { z } from 'zod';

/** A calendar date as the API exchanges it: AAAA-MM-JJ, no time, no timezone. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date invalide');

/** Today as AAAA-MM-JJ (UTC), comparable with isoDateSchema values as strings. */
export const today = (): string => new Date().toISOString().slice(0, 10);
