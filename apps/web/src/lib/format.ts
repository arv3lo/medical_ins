/** 1985-03-12 → 12/03/1985, without going through Date (no timezone shift). */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
