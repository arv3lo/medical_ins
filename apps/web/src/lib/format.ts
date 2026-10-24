/** 1985-03-12 → 12/03/1985, without going through Date (no timezone shift). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** An instant → its local time, 09:30. */
export function formatTime(instant: string): string {
  return new Date(instant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** A local date (AAAA-MM-JJ) and time (HH:MM) → the instant, as ISO with offset (UTC). */
export function toInstant(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

/** The instants where local day `date` starts and where the `days`-th day after it ends. */
export function daysRange(date: string, days: number): { from: string; to: string } {
  const from = new Date(`${date}T00:00`);
  return { from: from.toISOString(), to: new Date(`${addDays(date, days)}T00:00`).toISOString() };
}

/** The instants where a local day starts and the next one starts. */
export const dayRange = (date: string) => daysRange(date, 1);

/** A local date (AAAA-MM-JJ) moved by `days` whole days. */
export function addDays(date: string, days: number): string {
  const moment = new Date(`${date}T12:00`);
  moment.setDate(moment.getDate() + days);
  return localDateOf(moment);
}

/** The local calendar date of a moment, AAAA-MM-JJ. */
function localDateOf(moment: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}

/** Today as a local date, AAAA-MM-JJ. */
export function localToday(): string {
  return localDateOf(new Date());
}

/** An instant → the local date it falls on, 03/11/2026. */
export function formatLocalDate(instant: string): string {
  return formatDate(localDateOf(new Date(instant)));
}
