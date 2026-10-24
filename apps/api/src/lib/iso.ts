/** A timestamp as the API returns it: ISO 8601 in UTC; null stays null. */
export function iso(date: Date): string;
export function iso(date: Date | null): string | null;
export function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}
