import { z } from 'zod';
import { routeEstimateSchema, type Coordinate, type RouteEstimate, type TravelMode } from '../../contracts/src/api';
import type { TravelMatrix } from '../../contracts/src/guide';
import { coordinateSchema } from '../../contracts/src/api';
import { liveRouteSchema, providerPlaceId, type LiveRoute } from '../../contracts/src/locations';

export class ProviderError extends Error {
  constructor(public code: 'NOT_CONFIGURED' | 'QUOTA' | 'UNAVAILABLE' | 'NO_ROUTE' | 'INVALID_RESPONSE', message: string) { super(message); }
}
export interface RouteProvider { compute(origin: Coordinate, destination: Coordinate, departureTime: string, signal?: AbortSignal): Promise<RouteEstimate>; }
export interface LiveRouteProvider { itinerary(origin: Coordinate, destination: Coordinate, stops: Coordinate[], departureTime: string, optimize: boolean, signal?: AbortSignal, mode?: TravelMode): Promise<LiveRoute>; matrix?(points: Coordinate[], departureTime: string, mode: TravelMode): Promise<TravelMatrix> }
const responseSchema = z.object({ routes: z.array(z.object({ duration: z.string().regex(/^\d+(?:\.\d+)?s$/), distanceMeters: z.number().int().nonnegative(), polyline: z.object({ encodedPolyline: z.string().min(1).max(100000) }) })).max(5).optional() });
export class GoogleRoutes implements RouteProvider, LiveRouteProvider {
  constructor(private key: string, private request: typeof fetch = fetch, private clock = () => Date.now()) {}
  async itinerary(origin: Coordinate, destination: Coordinate, stops: Coordinate[], departureTime: string, optimize: boolean, signal?: AbortSignal, mode: TravelMode = 'DRIVE'): Promise<LiveRoute> {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Configure GOOGLE_ROUTES_API_KEY and enable Routes API.');
    // One visit has a unique order. Google can return invalid optimization
    // metadata for that case; request optimization only when order can change.
    const optimizeWaypoints = optimize && stops.length > 1;
    const waypoint = (point: Coordinate) => ({ location: { latLng: coordinateSchema.parse(point) } });
    const schema = z.object({ routes: z.array(z.object({ duration: z.string().regex(/^\d+(?:\.\d+)?s$/), distanceMeters: z.number().int().nonnegative(), polyline: z.object({ encodedPolyline: z.string().min(1).max(100000) }), legs: z.array(z.object({ duration: z.string().regex(/^\d+(?:\.\d+)?s$/), distanceMeters: z.number().int().nonnegative() })), optimizedIntermediateWaypointIndex: z.array(z.number().int()).optional() })).optional() });
    let response: Response;
    try { response = await this.request('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex' }, body: JSON.stringify({ origin: waypoint(origin), destination: waypoint(destination), intermediates: stops.map(waypoint), travelMode: mode, ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE', departureTime } : {}), optimizeWaypointOrder: optimizeWaypoints, computeAlternativeRoutes: false, units: 'METRIC' }) }); }
    catch { throw new ProviderError('UNAVAILABLE', 'Google Routes timed out or is unavailable. Retry; no route was substituted.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'Google rejected routing. Check Routes API, billing and server key restrictions.');
    let parsed: z.infer<typeof schema>; try { parsed = schema.parse(await response.json()); } catch { throw new ProviderError('INVALID_RESPONSE', 'The Google route response was incomplete.'); }
    const route = parsed.routes?.[0]; if (!route) throw new ProviderError('NO_ROUTE', 'No driving route was returned for these selected places.');
    const order = optimizeWaypoints ? route.optimizedIntermediateWaypointIndex : stops.map((_, index) => index);
    if (!order || order.length !== stops.length || new Set(order).size !== stops.length || order.some(index => index < 0 || index >= stops.length) || route.legs.length !== stops.length + 1) throw new ProviderError('INVALID_RESPONSE', 'Google returned an invalid stop order or missing route legs.');
    const now = this.clock();
    return liveRouteSchema.parse({ provider: 'google_routes', mode, durationSeconds: Number(route.duration.slice(0, -1)), distanceMeters: route.distanceMeters, encodedPolyline: route.polyline.encodedPolyline, departureTime, fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString(), trafficBasis: mode === 'DRIVE' ? 'prediction_for_departure' : 'static_estimate', persistence: 'memory_only', legs: route.legs.map(leg => ({ durationSeconds: Number(leg.duration.slice(0, -1)), distanceMeters: leg.distanceMeters })), optimizedOrder: order });
  }
  async matrix(points: Coordinate[], departureTime: string, mode: TravelMode): Promise<TravelMatrix> {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Configure the Routes API server key.');
    if (points.length < 2 || points.length > 10) throw new ProviderError('INVALID_RESPONSE', 'A guide matrix supports at most ten validated points.');
    const waypoints = points.map(p => ({ waypoint: { location: { latLng: coordinateSchema.parse(p) } } }));
    let response: Response;
    try { response = await this.request('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration' }, body: JSON.stringify({ origins: waypoints, destinations: waypoints, travelMode: mode, ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE', departureTime } : {}) }) }); }
    catch { throw new ProviderError('UNAVAILABLE', 'Google travel-time comparison timed out. Retry; no estimated distance matrix was substituted.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'Google rejected travel-time comparison. Check Routes API, billing and server restrictions.');
    const element = z.object({ originIndex: z.number().int().nonnegative().default(0), destinationIndex: z.number().int().nonnegative().default(0), status: z.object({ code: z.number().int().default(0) }).optional(), condition: z.string(), distanceMeters: z.number().int().nonnegative().optional(), duration: z.string().regex(/^\d+(?:\.\d+)?s$/).optional() });
    let rows: z.infer<typeof element>[]; try { rows = z.array(element).max(100).parse(await response.json()); } catch { throw new ProviderError('INVALID_RESPONSE', 'Google returned an invalid travel-time matrix.'); }
    const matrix: TravelMatrix = points.map(() => points.map(() => null)), seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.originIndex}:${row.destinationIndex}`;
      if (row.originIndex >= points.length || row.destinationIndex >= points.length || seen.has(key)) throw new ProviderError('INVALID_RESPONSE', 'Google returned inconsistent travel-time indices.'); seen.add(key);
      if ((row.status?.code ?? 0) !== 0 || row.condition !== 'ROUTE_EXISTS' || row.duration === undefined) continue;
      // Requested protobuf scalar zero values may be omitted; a confirmed
      // ROUTE_EXISTS duration is required before interpreting zero distance.
      matrix[row.originIndex][row.destinationIndex] = { durationSeconds: Number(row.duration.slice(0, -1)), distanceMeters: row.distanceMeters ?? 0 };
    }
    return matrix;
  }
  async compute(origin: Coordinate, destination: Coordinate, departureTime: string, signal?: AbortSignal): Promise<RouteEstimate> {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Routing is not configured.');
    const waypoint = (point: Coordinate) => ({ location: { latLng: point } });
    let response: Response;
    try {
      response = await this.request('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
        body: JSON.stringify({ origin: waypoint(origin), destination: waypoint(destination), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', departureTime, computeAlternativeRoutes: false, units: 'METRIC' }),
      });
    } catch { throw new ProviderError('UNAVAILABLE', 'The routing provider did not respond. No route was substituted.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'The routing provider rejected the request. Retry later or check server configuration.');
    let parsed: z.infer<typeof responseSchema>;
    try { parsed = responseSchema.parse(await response.json()); } catch { throw new ProviderError('INVALID_RESPONSE', 'The routing response was incomplete.'); }
    const route = parsed.routes?.[0]; if (!route) throw new ProviderError('NO_ROUTE', 'No driving route was returned for these points.');
    const now = this.clock();
    return routeEstimateSchema.parse({ provider: 'google_routes', mode: 'DRIVE', durationSeconds: Number(route.duration.slice(0, -1)), distanceMeters: route.distanceMeters, encodedPolyline: route.polyline.encodedPolyline, departureTime, fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + 5 * 60000).toISOString(), trafficBasis: 'prediction_for_departure', persistence: 'memory_only' });
  }
}
const placeSchema = z.object({ id: z.string(), displayName: z.object({ text: z.string().max(300) }), formattedAddress: z.string().max(1000).optional(), location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }), googleMapsUri: z.url().optional(), attributions: z.array(z.object({ provider: z.string(), providerUri: z.url().optional() })).optional() });
export type GooglePlaceDetails = z.infer<typeof placeSchema> & { provider: 'google_places'; persistence: 'memory_only'; fetchedAt: string };
export class GooglePlaces {
  constructor(private key: string, private request: typeof fetch = fetch) {}
  async details(placeId: string): Promise<GooglePlaceDetails> {
    if (!this.key) throw new ProviderError('NOT_CONFIGURED', 'Place enrichment is not configured.');
    if (!providerPlaceId.safeParse(placeId).success) throw new ProviderError('INVALID_RESPONSE', 'This provider place ID is invalid.');
    let response: Response;
    try { response = await this.request(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri,attributions' }, signal: AbortSignal.timeout(8000) }); }
    catch { throw new ProviderError('UNAVAILABLE', 'The place provider did not respond.'); }
    if (!response.ok) throw new ProviderError(response.status === 429 ? 'QUOTA' : 'UNAVAILABLE', 'Place enrichment is unavailable.');
    try { return { ...placeSchema.parse(await response.json()), provider: 'google_places', persistence: 'memory_only', fetchedAt: new Date().toISOString() }; }
    catch { throw new ProviderError('INVALID_RESPONSE', 'Place details were incomplete.'); }
  }
}
