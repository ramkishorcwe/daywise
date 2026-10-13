import { backupByteLimit, dayBackupSchema, type DayBackup } from '../../contracts/src/backup';
import { sessionSchema, type City, type TripInput, type TripSession } from '../../contracts/src';
import { matchingProgress } from './day-view';
import { groupBudget } from './money';
import { zonedTime, minutes } from './time';
import { sameValue } from './versioning';

export function validateBackupDay(session: TripSession, city: City): void {
  sessionSchema.parse(session);
  const placeIds = new Set(city.places.map(place => place.id)), anchorIds = new Set(city.anchors.map(anchor => anchor.id));
  function input(value: TripInput) {
    if (value.cityId !== city.id || value.currency !== city.currency || !anchorIds.has(value.startAnchorId) || !anchorIds.has(value.endAnchorId) || [...value.mustVisitIds, ...value.excludedPlaceIds].some(id => !placeIds.has(id))) throw new Error('The backup uses a city, currency or place that this catalog does not support.');
    try { zonedTime(value.date, value.startTime, city.timezone); zonedTime(value.date, value.endTime, city.timezone); }
    catch { throw new Error('The backup date or time is not supported in this city timezone.'); }
  }
  input(session.input);
  if (session.draftOrder && (new Set(session.draftOrder).size !== session.draftOrder.length || session.draftOrder.some(id => !placeIds.has(id)))) throw new Error('The backup draft contains unsupported or duplicate stops.');
  if (!session.confirmed) return;
  const { input: accepted, plan } = session.confirmed; input(accepted);
  if (plan.timezone !== city.timezone || plan.budgetLimit !== groupBudget(accepted) || plan.startMs !== zonedTime(accepted.date, accepted.startTime, city.timezone) || plan.finishMs > zonedTime(accepted.date, accepted.endTime, city.timezone)) throw new Error('The backup accepted schedule does not match its date, timezone or budget.');
  if (!sameValue(plan.order, plan.stops.filter(stop => stop.kind !== 'break').map(stop => stop.placeId)) || accepted.mustVisitIds.some(id => !plan.order.includes(id)) || accepted.excludedPlaceIds.some(id => plan.order.includes(id))) throw new Error('The backup accepted order is inconsistent.');
  let cursor = plan.startMs, previous = accepted.startAnchorId;
  for (const stop of plan.stops) {
    const place = city.places.find(value => value.id === stop.placeId);
    if (stop.kind !== 'break' && (!place || stop.id !== place.id || stop.category !== place.category || (stop.kind === 'meal') !== (place.category === 'food'))) throw new Error('The backup accepted plan contains an unsupported stop.');
    if (stop.kind === 'break' && (stop.placeId !== null || stop.category !== 'rest')) throw new Error('The backup rest break is inconsistent.');
    const destination = stop.placeId ?? previous;
    if (stop.incomingLeg.fromId !== previous || stop.incomingLeg.toId !== destination || stop.arrivalMs < cursor + minutes(stop.incomingLeg.durationMinutes + stop.waitMinutes)) throw new Error('The backup travel sequence is inconsistent.');
    if (stop.name.length > 500 || stop.reason.length > 2000) throw new Error('The backup contains oversized stop descriptions.');
    cursor = stop.departureMs; previous = destination;
  }
  if (plan.returnLeg.fromId !== previous || plan.returnLeg.toId !== accepted.endAnchorId || plan.finishMs < cursor + minutes(plan.returnLeg.durationMinutes)) throw new Error('The backup return journey is inconsistent.');
}
export function makeDayBackup(session: TripSession, city: City): DayBackup {
  validateBackupDay(session, city);
  const copy = structuredClone(session);
  if (copy.assistant) {
    const progress = copy.confirmed ? matchingProgress(copy.confirmed, copy.assistant) : null;
    if (copy.assistant.progress?.revision && !progress) throw new Error('Saved progress does not match the accepted day. It cannot be backed up safely.');
    copy.assistant = progress?.revision ? { tripId: null, baseId: copy.confirmed!.id, progress } : undefined;
  }
  return dayBackupSchema.parse({ kind: 'daywise-private-day', formatVersion: 1, dataMode: 'software_fixture', exportedAt: new Date().toISOString(), session: copy });
}
export function encodeDayBackup(backup: DayBackup): string {
  const text = JSON.stringify(dayBackupSchema.parse(backup), null, 2);
  if (new TextEncoder().encode(text).length > backupByteLimit) throw new Error('This day is larger than the 1 MiB backup limit.');
  return text;
}
export function readDayBackup(text: string, cities: City[]): DayBackup {
  if (new TextEncoder().encode(text).length > backupByteLimit) throw new Error('Choose a backup no larger than 1 MiB.');
  let value: DayBackup;
  try { value = dayBackupSchema.parse(JSON.parse(text.replace(/^\uFEFF/, ''))); }
  catch { throw new Error('This file is not a supported Daywise private-day backup. Travel copies and budget/backend exports cannot be restored here.'); }
  const city = cities.find(city => city.id === value.session.input.cityId);
  if (!city) throw new Error('This backup city is not supported by the current catalog.');
  validateBackupDay(value.session, city); return value;
}
export function restoredDay(backup: DayBackup, city: City): TripSession {
  const value = dayBackupSchema.parse(backup); validateBackupDay(value.session, city);
  return sessionSchema.parse({ ...structuredClone(value.session), id: crypto.randomUUID(), title: `${value.session.title.slice(0, 145)} (restored)`, updatedAt: new Date().toISOString() });
}
