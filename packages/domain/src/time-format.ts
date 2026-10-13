export function formatTime(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(ms);
}
export function today(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(new Date());
  const part = (kind: string) => parts.find(value => value.type === kind)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const minutes = (value: number) => value * 60_000;
export function localDate(ms: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(new Date(ms));
  return ['year', 'month', 'day'].map(kind => parts.find(value => value.type === kind)!.value).join('-');
}
