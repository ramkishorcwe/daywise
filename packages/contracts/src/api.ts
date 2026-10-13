import { z } from 'zod';
import { confirmedSchema, tripInputSchema } from './index';
import { progressSchema } from './assistant';

export const idSchema = z.string().uuid();
export const orderSchema = z.array(z.string().min(1).max(80)).max(6).nullable();
export const createTripSchema = z.strictObject({ input: tripInputSchema });
export const editTripSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), input: tripInputSchema, order: orderSchema });
export const previewSchema = z.strictObject({ input: tripInputSchema, order: orderSchema });
export const generateSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative() });
export const confirmRequestSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), candidateId: idSchema, expectedConfirmedId: idSchema.nullable() });
export const remoteTripSchema = z.strictObject({
  schemaVersion: z.literal(1), id: idSchema, ownerId: z.string().min(1).max(128), input: tripInputSchema,
  order: orderSchema, revision: z.number().int().nonnegative(), confirmed: confirmedSchema.nullable(), updatedAt: z.iso.datetime(),
  progress: progressSchema.optional(),
  history: z.array(z.strictObject({ id: idSchema, previousConfirmedId: idSchema, confirmedId: idSchema, trigger: z.enum(['delay', 'pace', 'remove']), acceptedAt: z.iso.datetime() })).max(20).optional(),
});
export type RemoteTrip = z.infer<typeof remoteTripSchema>;
export const coordinateSchema = z.strictObject({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
export type Coordinate = z.infer<typeof coordinateSchema>;
export const travelModeSchema = z.enum(['DRIVE', 'WALK', 'BICYCLE']);
export type TravelMode = z.infer<typeof travelModeSchema>;
export const routeRequestSchema = z.strictObject({ fromId: z.string().min(1).max(80), toId: z.string().min(1).max(80), departureTime: z.iso.datetime() });
export const routeEstimateSchema = z.strictObject({
  provider: z.literal('google_routes'), mode: travelModeSchema, durationSeconds: z.number().nonnegative(), distanceMeters: z.number().nonnegative(),
  encodedPolyline: z.string().min(1).max(100000), departureTime: z.iso.datetime(), fetchedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  trafficBasis: z.enum(['prediction_for_departure', 'static_estimate']), persistence: z.literal('memory_only'),
});
export type RouteEstimate = z.infer<typeof routeEstimateSchema>;
export const apiCapabilitiesSchema = z.strictObject({
  schemaVersion: z.literal(1), authMode: z.enum(['local', 'firebase']), persistence: z.enum(['local_file', 'firestore']),
  fixturePlanning: z.boolean(), routingConfigured: z.boolean(), placesConfigured: z.boolean(),
  checkedCities: z.number().int().nonnegative(), livePlanning: z.literal(false),
  assistantMode: z.enum(['local', 'openai', 'gemini']).optional(),
});
export type ApiCapabilities = z.infer<typeof apiCapabilitiesSchema>;
