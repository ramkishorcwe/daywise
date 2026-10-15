import { apiCapabilitiesSchema, remoteTripSchema, routeEstimateSchema, type ApiCapabilities, type RemoteTrip, type RouteEstimate } from '../../../packages/contracts/src/api';
import { planSchema, type PlanningResult, type TripInput } from '../../../packages/contracts/src';
import { checkedCitySchema, type CheckedCity } from '../../../packages/data-adapters/src/catalog';
import { z } from 'zod';
import { assistantReplySchema, type Proposal } from '../../../packages/contracts/src/assistant';
import { readinessSchema } from '../../../packages/contracts/src/readiness';
import { rememberEvidence, attachEvidence, clearEvidence } from './evidence-cache';

let token: string | null = null;
let refreshToken: (() => Promise<string>) | null = null;
export const backendConnected = () => token !== null;
export function disconnectBackend() { token = null; refreshToken = null; clearEvidence(); }
export class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  if (authenticated && refreshToken) token = await refreshToken();
  const headers = new Headers(init.headers); if (init.body) headers.set('Content-Type', 'application/json');
  if (authenticated) { if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Connect to the backend first.'); headers.set('Authorization', `Bearer ${token}`); }
  const milliseconds = path === '/guide/plan' ? 80000 : path === '/guide/discover' || path === '/plans/live' ? 60000 : path === '/festivals/search' ? 35000 : 20000;
  const timeout = AbortSignal.timeout(milliseconds);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const timedOut = () => new HttpError(408, 'REQUEST_TIMEOUT', `${path === '/guide/plan' ? 'Itinerary planning' : path === '/guide/discover' ? 'Attraction discovery' : 'The request'} took longer than ${milliseconds / 1000} seconds. Retry when ready; no automatic retry was sent. Your accepted trip is preserved.`);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...init, ...(typeof init.body === 'string' ? { body: attachEvidence(init.body) } : {}), headers, signal }); }
  catch (error) { if (init.signal?.aborted) throw error; if (timeout.aborted) throw timedOut(); throw new Error(import.meta.env.DEV ? 'The backend is unavailable. Start it with npm run dev:api, then retry.' : 'Daywise could not reach its server. Check your connection and retry; your saved trip is preserved.'); }
  let data: unknown; try { data = await response.json(); } catch (error) { if (init.signal?.aborted) throw error; if (timeout.aborted) throw timedOut(); throw new Error('The backend returned an unreadable response.'); }
  if (!response.ok) { const failure = data as { error?: { code?: string; message?: string } }; throw new HttpError(response.status, failure.error?.code ?? 'REQUEST_FAILED', failure.error?.message ?? 'The request failed.'); }
  rememberEvidence(data);
  return data as T;
}
export const capabilities = async () => apiCapabilitiesSchema.parse(await request('/health', {}, false));
export const planningReadiness = async () => readinessSchema.parse(await request('/readiness', {}, false));
export async function exportRemoteTrip(id: string) {
  const trip = await getRemoteTrip(id);
  const { input, order, confirmed, progress, history } = trip;
  const file = new Blob([JSON.stringify({ schemaVersion: 1, dataMode: 'software_fixture', exportedAt: new Date().toISOString(), input, order, confirmed, progress, history }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file), link = document.createElement('a');
  link.href = url; link.download = `daywise-private-trip-${trip.id}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function connectBackend(): Promise<ApiCapabilities> {
  const status = await capabilities();
  if (status.authMode === 'local') {
    let existing: { token: string; expiresAt: string } | null = null;
    try { existing = JSON.parse(sessionStorage.getItem('daywise-api-session') ?? 'null'); } catch { /* unavailable session storage: use memory */ }
    if (existing && Date.parse(existing.expiresAt) > Date.now()) token = existing.token;
    if (token) { try { await request('/trips'); } catch { token = null; } }
    if (!token) { const session = z.strictObject({ token: z.string(), expiresAt: z.iso.datetime() }).parse(await request('/dev/session', { method: 'POST' }, false)); token = session.token; try { sessionStorage.setItem('daywise-api-session', JSON.stringify(session)); } catch { /* in-memory session still works */ } }
  } else {
    const { connectFirebase } = await import('./firebase-auth'); refreshToken = await connectFirebase(); token = await refreshToken();
  }
  return status;
}
const mutation = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
export async function previewOnServer(input: TripInput, order: string[] | null, signal: AbortSignal): Promise<PlanningResult> {
  const value = await request<PlanningResult>('/plans/preview', { ...mutation('POST', { input, order }), signal });
  if (value.outcome === 'feasible') return { ...value, plan: planSchema.parse(value.plan) };
  return z.strictObject({ outcome: z.enum(['needs_information', 'no_plan_found']), issues: z.array(z.strictObject({ code: z.string(), message: z.string() })) }).parse(value);
}
export async function remoteTrips() { const value = await request<{ trips: unknown[] }>('/trips'); return value.trips.map(trip => remoteTripSchema.parse(trip)); }
export async function saveRemoteInput(input: TripInput) { return remoteTripSchema.parse(await request('/trips', mutation('POST', { input }))); }
export async function deleteRemoteTrip(trip: RemoteTrip) { return request(`/trips/${trip.id}`, mutation('DELETE', { expectedRevision: trip.revision })); }
export async function generateRemoteTrip(trip: RemoteTrip) {
  const value = await request<{ result: PlanningResult; candidate: { id: string; expiresAt: string } | null }>(`/trips/${trip.id}/generate`, mutation('POST', { expectedRevision: trip.revision }));
  if (value.result.outcome === 'feasible') value.result.plan = planSchema.parse(value.result.plan);
  return value;
}
export async function confirmRemoteTrip(trip: RemoteTrip, candidateId: string) { return remoteTripSchema.parse(await request(`/trips/${trip.id}/confirm`, mutation('POST', { expectedRevision: trip.revision, expectedConfirmedId: trip.confirmed?.id ?? null, candidateId }))); }
export async function checkedCities(): Promise<CheckedCity[]> { const value = await request<{ checked: unknown[] }>('/cities'); return value.checked.map(city => checkedCitySchema.parse(city)); }
export async function checkedRoute(cityId: string, fromId: string, toId: string): Promise<RouteEstimate> { return routeEstimateSchema.parse(await request(`/cities/${encodeURIComponent(cityId)}/route`, mutation('POST', { fromId, toId, departureTime: new Date(Date.now() + 120000).toISOString() }))); }
export async function getRemoteTrip(id: string) { return remoteTripSchema.parse(await request(`/trips/${id}`)); }
export async function setRemoteOrder(trip: RemoteTrip, order: string[]) { return remoteTripSchema.parse(await request(`/trips/${trip.id}`, mutation('PATCH', { expectedRevision: trip.revision, input: trip.input, order }))); }
export async function assistantTurn(trip: RemoteTrip, message: string) { const value = await request<{ reply: unknown; trip: unknown }>('/assistant/turns', mutation('POST', { tripId: trip.id, expectedRevision: trip.revision, message })); return { reply: assistantReplySchema.parse(value.reply), trip: remoteTripSchema.parse(value.trip) }; }
export async function reportProgress(trip: RemoteTrip, completedCount: number, delayMinutes: number) { return remoteTripSchema.parse(await request(`/trips/${trip.id}/progress`, mutation('POST', { expectedRevision: trip.revision, expectedProgressRevision: trip.progress?.revision ?? 0, completedCount, delayMinutes }))); }
export async function decideProposal(trip: RemoteTrip, proposal: Proposal, accept: boolean) { return remoteTripSchema.parse(await request(`/trips/${trip.id}/proposals/${proposal.id}/${accept ? 'accept' : 'reject'}`, mutation('POST', { expectedRevision: trip.revision, expectedProgressRevision: trip.progress?.revision ?? 0, expectedConfirmedId: trip.confirmed!.id }))); }
