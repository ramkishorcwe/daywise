import { sessionSchema, type City, type TripSession } from '../../contracts/src';
import { reuseDaySchema, type ReuseDay } from '../../contracts/src/reuse-day';
import { validateInput } from './planner';

export function reusedDraft(source: TripSession, city: City, request: ReuseDay): TripSession {
  sessionSchema.parse(source); const options = reuseDaySchema.parse(request);
  if (source.input.cityId !== city.id) throw new Error('The saved day belongs to a different city.');
  if (options.basis === 'accepted' && !source.confirmed) throw new Error('This saved day has no accepted preferences to reuse.');
  const chosen = options.basis === 'accepted' ? source.confirmed!.input : source.input;
  const input = { ...structuredClone(chosen), date: options.date, startTime: options.startTime, endTime: options.endTime };
  const issues = validateInput(input, city); if (issues.length) throw new Error(issues.map(issue => issue.message).join(' '));
  const savedOrder = options.basis === 'accepted' ? source.confirmed!.plan.order : source.draftOrder;
  const order = options.keepOrder && savedOrder !== null ? structuredClone(savedOrder) : null;
  if (order && (new Set(order).size !== order.length || order.some(id => !city.places.some(place => place.id === id)))) throw new Error('The saved order includes duplicate or retired places. Turn off keeping the order to select fresh stops.');
  // Deliberately construct a new draft: past acceptances, reports, expenses and
  // backend workspace identifiers must never become facts about another date.
  return sessionSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), title: options.title, input, draftOrder: order, confirmed: null, updatedAt: new Date().toISOString() });
}
