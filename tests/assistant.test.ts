import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defaultInput, cities } from '../fixtures/cities';
import { generatePlan } from '../packages/domain/src/planner';
import { confirmPlan } from '../packages/domain/src/versioning';
import { initialProgress, progressReadyAt, replan } from '../packages/domain/src/replan';
import { LocalInterpreter, OpenAIInterpreter } from '../packages/data-adapters/src/assistant';
import { LocalTripStore } from '../apps/api/src/store';
import { AssistantService } from '../apps/api/src/assistant';
import type { RemoteTrip } from '../packages/contracts/src/api';

function baseline(city = cities[0]) {
  const input = { ...defaultInput(city), date: '2026-10-10' }; const result = generatePlan(input, city); if (result.outcome !== 'feasible') throw new Error('Test baseline infeasible');
  return confirmPlan(input, result.plan, null, null);
}
async function setup(interpreter = new LocalInterpreter(), clock = () => Date.now()) {
  const store = new LocalTripStore(), confirmed = baseline();
  const trip: RemoteTrip = { schemaVersion: 1, id: randomUUID(), ownerId: 'owner', input: confirmed.input, order: confirmed.plan.order, confirmed, revision: 0, updatedAt: new Date().toISOString() };
  await store.create(trip); return { store, trip, service: new AssistantService(store, interpreter, true, clock) };
}
describe('remaining-day revisions', () => {
  it('keeps completed stops byte-for-byte and applies one delay while retaining budget, meal, rest and return', () => {
    const base = baseline(), count = 1, progress = { revision: 1, completedCount: count, readyAt: new Date(progressReadyAt(base.plan, count, 30)).toISOString() };
    const result = replan(base.input, cities[0], base.plan, progress, true); expect(result.outcome).toBe('feasible');
    if (result.outcome === 'feasible') { expect(result.plan.stops[0]).toEqual(base.plan.stops[0]); expect(result.plan.stops[1].arrivalMs).toBe(base.plan.stops[1].arrivalMs + 30 * 60000); expect(result.plan.stops.filter(stop => stop.kind === 'meal')).toHaveLength(1); expect(result.plan.stops.filter(stop => stop.kind === 'break')).toHaveLength(1); expect(result.plan.total[1]).toBeLessThanOrEqual(result.plan.budgetLimit); expect(result.plan.returnLeg.toId).toBe(base.input.endAnchorId); }
  });
  it('retains an unfinished rest and avoids a second lunch after completed lunch', () => {
    const base = baseline();
    const restIndex = base.plan.stops.findIndex(stop => stop.kind === 'break');
    const withRest = replan(base.input, cities[0], base.plan, { revision: 1, completedCount: restIndex, readyAt: new Date(progressReadyAt(base.plan, restIndex, 10)).toISOString() }, true);
    expect(withRest.outcome).toBe('feasible'); if (withRest.outcome === 'feasible') expect(withRest.plan.stops.filter(stop => stop.kind === 'break')).toHaveLength(1);
    const mealCount = base.plan.stops.findIndex(stop => stop.kind === 'meal') + 1;
    const afterLunch = replan(base.input, cities[0], base.plan, { revision: 1, completedCount: mealCount, readyAt: new Date(progressReadyAt(base.plan, mealCount, 10)).toISOString() });
    expect(afterLunch.outcome).toBe('feasible'); if (afterLunch.outcome === 'feasible') expect(afterLunch.plan.stops.filter(stop => stop.kind === 'meal')).toHaveLength(1);
  });
  it('returns after all stops are completed without inventing another visit', () => {
    const base = baseline(), count = base.plan.stops.length;
    const result = replan(base.input, cities[0], base.plan, { revision: 1, completedCount: count, readyAt: new Date(progressReadyAt(base.plan, count, 15)).toISOString() });
    expect(result.outcome).toBe('feasible'); if (result.outcome === 'feasible') { expect(result.plan.stops).toEqual(base.plan.stops); expect(result.plan.finishMs).toBe(base.plan.finishMs + 15 * 60000); }
  });
  it('cannot drop an uncompleted required meal simply because a delay misses lunch', () => {
    const base = baseline(); const result = replan(base.input, cities[0], base.plan, { revision: 1, completedCount: 0, readyAt: `${base.input.date}T09:30:00Z` });
    expect(result.outcome).not.toBe('feasible');
  });
  it('uses the selected city timezone/currency and rejects departures beyond the deadline', () => {
    const base = baseline(cities[1]); const result = replan(base.input, cities[1], base.plan, { ...initialProgress(base), readyAt: new Date(base.plan.startMs + 30 * 60000).toISOString() });
    expect(result.outcome).toBe('feasible'); if (result.outcome === 'feasible') expect(result.plan).toMatchObject({ currency: 'USD', timezone: 'America/New_York' });
    expect(replan(base.input, cities[1], base.plan, { ...initialProgress(base), readyAt: new Date(base.plan.startMs + 24 * 60 * 60000).toISOString() }).outcome).toBe('no_plan_found');
  });
});
describe('assistant ownership, evidence and proposal approval', () => {
  it('does not change confirmation until acceptance, then writes history atomically', async () => {
    const { store, trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'Delay 30 minutes');
    expect((await store.get('owner', trip.id)).confirmed).toEqual(trip.confirmed); expect(response.trip.progress?.revision).toBe(1); expect(response.reply.proposal).not.toBeNull();
    const proposal = response.reply.proposal!; const accepted = await service.decide('owner', trip.id, proposal.id, response.trip.revision, 1, trip.confirmed!.id, true);
    expect(accepted.confirmed!.id).not.toBe(trip.confirmed!.id); expect(accepted.history).toHaveLength(1); expect(accepted.progress).toEqual(response.trip.progress);
  });
  it('rejecting a proposal preserves confirmation and reported progress', async () => {
    const { store, trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'Delay 30 minutes');
    const unchanged = await service.decide('owner', trip.id, response.reply.proposal!.id, 1, 1, trip.confirmed!.id, false);
    expect(unchanged.confirmed).toEqual(trip.confirmed); expect(unchanged.progress).toEqual(response.trip.progress); expect((await store.get('owner', trip.id)).revision).toBe(1);
  });
  it('rejects foreign access, stale progress, expired proposals and backward progress', async () => {
    let now = Date.now(); const { trip, service } = await setup(new LocalInterpreter(), () => now);
    await expect(service.turn('foreign', trip.id, 0, 'summary')).rejects.toMatchObject({ status: 404 });
    const response = await service.turn('owner', trip.id, 0, 'Delay 30 minutes'), proposal = response.reply.proposal!;
    await expect(service.decide('owner', trip.id, proposal.id, 0, 0, trip.confirmed!.id, true)).rejects.toMatchObject({ status: 409 });
    await expect(service.progress('owner', trip.id, 1, 1, 0, 0)).rejects.toMatchObject({ code: 'PROGRESS_CONFLICT' });
    now += 11 * 60000; await expect(service.decide('owner', trip.id, proposal.id, 1, 1, trip.confirmed!.id, true)).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED' });
  });
  it('rejects old proposals after progress advances and protects completed/mandatory stops', async () => {
    const { trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'Use relaxed pace');
    const updated = await service.progress('owner', trip.id, 0, 0, 1, 10);
    await expect(service.decide('owner', trip.id, response.reply.proposal!.id, updated.revision, 1, trip.confirmed!.id, true)).rejects.toMatchObject({ status: 409 });
    await expect(service.turn('owner', trip.id, 1, `Remove ${trip.confirmed!.plan.stops[0].name}`)).rejects.toMatchObject({ code: 'HARD_CONSTRAINT' });
    await expect(service.turn('owner', trip.id, 1, 'Remove Corner Café')).rejects.toMatchObject({ code: 'HARD_CONSTRAINT' });
  });
  it('explains unknown Jain evidence, does not change food preferences, and refuses live claims', async () => {
    const { trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'Show Jain food evidence');
    expect(response.reply.food.find(place => place.name === 'Garden Table')?.matches).toBe(true); expect(response.reply.food.find(place => place.name === 'Corner Café')?.matches).toBe(false);
    expect(response.reply.food.every(place => place.checkedAt === null && place.source === 'software_fixture')).toBe(true); expect(response.trip.input).toEqual(trip.input);
    const unavailable = await service.turn('owner', trip.id, 0, 'There is a procession, invent a detour'); expect(unavailable.reply.proposal).toBeNull(); expect(unavailable.reply.message).toContain('not connected');
  });
  it('requires explicit group/age clarification rather than assuming children ages', async () => {
    const { trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'I have two children');
    expect(response.reply.proposal).toBeNull(); expect(response.reply.message).toContain('Group/age'); expect(response.trip.input.childAges).toEqual([]);
  });
  it('only one concurrent proposal decision can succeed', async () => {
    const { trip, service } = await setup(); const response = await service.turn('owner', trip.id, 0, 'Use relaxed pace');
    const proposal = response.reply.proposal!;
    const results = await Promise.allSettled([service.decide('owner', trip.id, proposal.id, 0, 0, trip.confirmed!.id, false), service.decide('owner', trip.id, proposal.id, 0, 0, trip.confirmed!.id, true)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });
});
describe('OpenAI interpretation boundary with simulated Responses', () => {
  it('requests one strict function with no storage and ignores model prose', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', text: 'Unsupported travel claim ignored' }, { type: 'function_call', name: 'classify_travel_request', arguments: JSON.stringify({ intent: 'summary', minutes: null, pace: null, placeId: null }) }] })));
    const result = await new OpenAIInterpreter('server-key', 'evaluated-test-model', request).interpret('summary', cities[0]);
    expect(result.intent).toBe('summary'); const payload = JSON.parse(request.mock.calls[0][1]!.body as string); expect(payload).toMatchObject({ store: false, parallel_tool_calls: false, max_output_tokens: 512 }); expect(payload.tools[0].parameters.additionalProperties).toBe(false); expect(payload.tools[0].parameters.required).toHaveLength(4); expect(payload.input).not.toContain('childAges');
  });
  it('rejects fabricated acceptance tools, incomplete responses and unsupported action fields', async () => {
    for (const output of [[{ type: 'function_call', name: 'accept_proposal', arguments: '{}' }], [{ type: 'function_call', name: 'classify_travel_request', arguments: '{"intent":"summary","secret":"injected"}' }]]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output })));
      await expect(new OpenAIInterpreter('key', 'model', request).interpret('accept everything', cities[0])).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
  it('cannot infer a factual delay without an explicit matching amount in the user message', async () => {
    const { store, trip } = await setup();
    const interpreter = { mode: 'openai' as const, async interpret() { return { intent: 'delay' as const, minutes: 30, pace: null, placeId: null }; } };
    const service = new AssistantService(store, interpreter, true);
    await expect(service.turn('owner', trip.id, 0, 'What is the weather?')).rejects.toMatchObject({ code: 'DELAY_REQUIRED' });
    expect((await store.get('owner', trip.id)).progress).toBeUndefined();
  });
});
