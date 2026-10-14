import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GeminiInterpreter } from '../packages/data-adapters/src/gemini';
import { guidePreferencesSchema } from '../packages/contracts/src/guide';
const id = randomUUID();
const context = { preferences: guidePreferencesSchema.parse({ adults: 2, childAges: [], groupBudget: 500, currency: 'INR', dietaryRules: [] }), trip: { city: 'Provider city', date: '2026-10-14', timezone: 'UTC', startTime: '09:00', endTime: '18:00' }, candidates: [{ id, name: 'Provider museum', categories: ['museums'], rating: 4, reviews: 150, suggestedMinutes: 90 }], travelMatrix: [[{ durationSeconds: 0, distanceMeters: 0 }]] };
const answer = { rankedIds: [id], interests: ['museums'], visits: [{ locationId: id, durationMinutes: 75, timeBand: 'morning' }] };
const response = (decision: unknown, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(decision) }] } }] });
it('Gemini returns validated priorities, duration allowances and soft time preferences using server headers', async () => {
  const request = vi.fn<typeof fetch>(async () => response(answer)); const result = await new GeminiInterpreter('test-server-secret', 'configured-model', request).rankGuide(context);
  expect(result.visits?.[0].durationMinutes).toBe(75); const [url, options] = request.mock.calls[0]; expect(url).not.toContain('test-server-secret'); expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'test-server-secret' });
  const body = JSON.parse(options?.body as string); expect(body.generationConfig.responseMimeType).toBe('application/json'); expect(body.generationConfig.responseJsonSchema.required).toContain('visits'); expect(options?.body).toContain('travelMatrix'); expect(options?.body).not.toContain('latitude');
});
it('Gemini invented and duplicate candidate IDs are rejected before route generation', async () => {
  for (const value of [{ ...answer, rankedIds: [randomUUID()] }, { ...answer, rankedIds: [id, id] }, { ...answer, visits: [{ ...answer.visits[0], locationId: randomUUID() }] }, { ...answer, visits: [answer.visits[0], answer.visits[0]] }]) await expect(new GeminiInterpreter('test', 'configured-model', async () => response(value)).rankGuide(context)).rejects.toThrow('unverified');
});
it('Gemini malformed visit durations, unsupported time bands and fabricated facts are rejected', async () => {
  for (const visits of [[{ ...answer.visits[0], durationMinutes: 0 }], [{ ...answer.visits[0], timeBand: 'sunset-guaranteed' }], [{ ...answer.visits[0], fabricatedPrice: 0 }]]) await expect(new GeminiInterpreter('test', 'configured-model', async () => response({ ...answer, visits })).rankGuide(context)).rejects.toThrow('invalid visit');
});
it('Gemini timeout, quota and truncated responses do not silently fall back to a invented day', async () => {
  await expect(new GeminiInterpreter('test', 'configured-model', async () => { throw new Error('network'); }).rankGuide(context)).rejects.toThrow('did not respond');
  await expect(new GeminiInterpreter('test', 'configured-model', async () => new Response('', { status: 429 })).rankGuide(context)).rejects.toThrow('quota');
  await expect(new GeminiInterpreter('test', 'configured-model', async () => response(answer, 'MAX_TOKENS')).rankGuide(context)).rejects.toThrow('incomplete');
});
it('Gemini model validation prevents an untrusted model value from changing the request endpoint', async () => {
  const request = vi.fn<typeof fetch>(); await expect(new GeminiInterpreter('test', '../other', request).rankGuide(context)).rejects.toThrow('valid GEMINI_MODEL'); expect(request).not.toHaveBeenCalled();
});
it('distinguishes Gemini provider quota from the app limit without retry storms or fabricated fallback', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response('', { status: 429 }));
  await expect(new GeminiInterpreter('test', 'configured-model', request).rankGuide(context)).rejects.toMatchObject({ code: 'QUOTA', message: expect.stringContaining('midnight Pacific time') });
  expect(request).toHaveBeenCalledTimes(1);
});
