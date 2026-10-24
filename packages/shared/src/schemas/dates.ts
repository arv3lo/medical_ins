import { z } from 'zod';

/** A calendar date as the API exchanges it: AAAA-MM-JJ, no time, no timezone. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date invalide');

// en-CA formats a date as AAAA-MM-JJ.
const madagascarDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo' });

/**
 * Today in Madagascar (UTC+3) as AAAA-MM-JJ, comparable with isoDateSchema values as strings.
 * The UTC date would still be yesterday between 00:00 and 03:00.
 */
export const today = (): string => madagascarDate.format(new Date());
