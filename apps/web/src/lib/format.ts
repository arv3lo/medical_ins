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

/** The instants where a local day starts and the next one starts. */
export function dayRange(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00`);
  const next = new Date(start);
  next.setDate(start.getDate() + 1);
  return { from: start.toISOString(), to: next.toISOString() };
}

/** Today as a local date, AAAA-MM-JJ. */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
