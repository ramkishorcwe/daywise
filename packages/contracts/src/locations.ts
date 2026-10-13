import { z } from 'zod';
import { coordinateSchema, routeEstimateSchema } from './api';

// Google place IDs have no published maximum length. Incoming API requests
// remain bounded by the server body limit; valid long IDs must not be truncated.
export const providerPlaceId = z.string().regex(/^[A-Za-z0-9_-]{5,}$/);
export const cityIdentitySchema = z.strictObject({ placeId: providerPlaceId, name: z.string().trim().min(1).max(300), countryCode: z.string().regex(/^[A-Z]{2}$/) });
export const locationSchema = z.strictObject({
  id: z.string().uuid(), placeId: providerPlaceId.nullable(), provider: z.enum(['google', 'device']), source: z.enum(['search', 'gps', 'pin', 'saved']),
  name: z.string().trim().min(1).max(300), address: z.string().trim().min(1).max(1000).nullable(), coordinates: coordinateSchema,
  addressStatus: z.enum(['resolved', 'unresolved']).optional(), receiptStatus: z.enum(['local', 'registered']).optional(),
  resolutionMessage: z.string().min(1).max(500).optional(), locality: z.string().max(300).nullable().optional(), state: z.string().max(300).nullable().optional(), country: z.string().max(300).nullable().optional(),
  city: cityIdentitySchema.nullable(), types: z.array(z.string()).max(50), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }).optional(),
  attributions: z.array(z.strictObject({ provider: z.string().min(1).max(300), providerUri: z.url().refine(value => /^https?:\/\//.test(value)).optional() })).max(30).optional(),
  accuracyMeters: z.number().finite().nonnegative().optional(), observedAt: z.iso.datetime().optional(),
  fetchedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), persistence: z.literal('memory_only'),
}).refine(value => value.source !== 'gps' || (value.accuracyMeters !== undefined && !!value.observedAt), 'GPS needs accuracy and observation time.').superRefine((value, context) => {
  if (value.source === 'search' && (!value.placeId || !value.address || value.provider !== 'google' || value.addressStatus === 'unresolved')) context.addIssue({ code: 'custom', message: 'Searched places require provider details and an address.' });
  if (value.address === null && (value.source === 'search' || value.provider !== 'device' || value.addressStatus !== 'unresolved' || value.placeId !== null || value.city !== null || value.types.length || value.timezone || value.locality || value.state || value.country)) context.addIssue({ code: 'custom', message: 'Unresolved coordinates must not claim provider address or city data.' });
  if (value.address !== null && (value.provider !== 'google' || !value.placeId || value.addressStatus === 'unresolved')) context.addIssue({ code: 'custom', message: 'Resolved addresses need provider evidence.' });
});
export type SelectedLocation = z.infer<typeof locationSchema>;
export type LocationData = Omit<SelectedLocation, 'id' | 'expiresAt' | 'persistence'>;
export function coordinateLocation(coordinates: z.infer<typeof coordinateSchema>, source: 'gps' | 'pin' | 'saved', gps?: { accuracyMeters: number; observedAt: string }): LocationData {
  return { provider: 'device', source, coordinates: coordinateSchema.parse(coordinates), placeId: null, name: source === 'gps' ? 'Captured browser location' : source === 'pin' ? 'Selected map point' : 'Saved coordinate point', address: null, addressStatus: 'unresolved', city: null, types: [], fetchedAt: new Date().toISOString(), ...(gps ?? {}) };
}
export const suggestionSchema = z.strictObject({ placeId: providerPlaceId, text: z.string().min(1).max(1000) });
export const autocompleteSchema = z.strictObject({ input: z.string().trim().min(2).max(240), sessionToken: z.string().uuid(), citiesOnly: z.boolean(), bias: coordinateSchema.optional() });
export const suggestionsSchema = z.strictObject({ suggestions: z.array(suggestionSchema).max(5), provider: z.literal('google') });
export const resolveLocationSchema = z.strictObject({ placeId: providerPlaceId, sessionToken: z.string().uuid(), destinationCity: z.boolean() });
export const reverseLocationSchema = z.strictObject({ coordinates: coordinateSchema, source: z.enum(['gps', 'pin', 'saved']), accuracyMeters: z.number().finite().nonnegative().optional(), observedAt: z.iso.datetime().optional() }).refine(value => value.source !== 'gps' || (value.accuracyMeters !== undefined && !!value.observedAt), 'GPS needs accuracy and observation time.');
export const liveRouteInputSchema = z.strictObject({
  destinationId: z.string().uuid(), startId: z.string().uuid(), returnToStart: z.boolean(), endId: z.string().uuid().nullable(),
  stops: z.array(z.strictObject({ locationId: z.string().uuid(), durationMinutes: z.number().int().min(0).max(480) })).min(1).max(5),
  date: z.iso.date(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  allowOutsideStart: z.boolean(), optimize: z.boolean(),
}).refine(value => value.returnToStart || !!value.endId, 'Choose a return location.');
export type LiveRouteInput = z.infer<typeof liveRouteInputSchema>;
export const liveRouteSchema = routeEstimateSchema.extend({
  legs: z.array(z.strictObject({ durationSeconds: z.number().finite().nonnegative(), distanceMeters: z.number().finite().nonnegative() })).min(2).max(8),
  optimizedOrder: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});
export type LiveRoute = z.infer<typeof liveRouteSchema>;
export const liveItinerarySchema = z.strictObject({
  route: liveRouteSchema, destination: locationSchema, start: locationSchema, end: locationSchema,
  stops: z.array(z.strictObject({ location: locationSchema, durationMinutes: z.number().int().min(0).max(480), arrivalAt: z.iso.datetime(), departureAt: z.iso.datetime() })).min(1).max(7),
  finishAt: z.iso.datetime(), deadlineAt: z.iso.datetime(), withinTime: z.boolean(), warnings: z.array(z.string()).max(12),
});
export type LiveItinerary = z.infer<typeof liveItinerarySchema>;
export function startMatchesDestination(start: SelectedLocation, destination: SelectedLocation): boolean {
  return !!start.city && !!destination.city && start.city.placeId === destination.city.placeId;
}
