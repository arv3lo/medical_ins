import { z } from 'zod';

/**
 * Date.parse rolls 2023-02-30 over to March 2, which Postgres then rejects: a real date gives
 * back the same string. zod still runs this refinement when the format check failed.
 */
function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A calendar date as the API exchanges it: AAAA-MM-JJ, no time, no timezone. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine(isCalendarDate, 'Date invalide');

// en-CA formats a date as AAAA-MM-JJ.
const madagascarDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo' });

/**
 * Today in Madagascar (UTC+3) as AAAA-MM-JJ, comparable with isoDateSchema values as strings.
 * The UTC date would still be yesterday between 00:00 and 03:00.
 */
export const today = (): string => madagascarDate.format(new Date());
