import { Temporal } from '@js-temporal/polyfill';

export function zonedTime(date: string, time: string, timezone: string): number {
  const day = Temporal.PlainDate.from(date);
  const clock = Temporal.PlainTime.from(time);
  return Number(Temporal.ZonedDateTime.from({ timeZone: timezone, year: day.year, month: day.month, day: day.day, hour: clock.hour, minute: clock.minute }, { disambiguation: 'reject' }).epochMilliseconds);
}
export { formatTime, today, minutes } from './time-format';
