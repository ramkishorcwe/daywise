import { guideDiscoverySchema, candidateSchema, guidePlanSchema, type GuidePreferences, type GuidePlanRequest } from '../../../packages/contracts/src/guide';
import { postLocation } from './location-api';
export const discoverGuide = async (destinationId: string, date: string, preferences: GuidePreferences, signal: AbortSignal) => guideDiscoverySchema.parse(await postLocation('/guide/discover', { destinationId, date, preferences }, signal));
export const addGuideCandidate = async (destinationId: string, date: string, preferences: GuidePreferences, locationId: string, signal: AbortSignal) => candidateSchema.parse(await postLocation('/guide/candidate', { destinationId, date, preferences, locationId }, signal));
export const planGuide = async (input: GuidePlanRequest, signal: AbortSignal) => guidePlanSchema.parse(await postLocation('/guide/plan', input, signal));
