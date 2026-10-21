import { z } from 'zod';
import { locationSchema, liveItinerarySchema, providerPlaceId } from './locations';
export const interests = ['history', 'forts', 'palaces', 'culture', 'temples', 'shopping', 'nature', 'gardens', 'museums', 'food', 'nightlife', 'hidden_gems'] as const;
export const mealKinds = ['lunch'] as const;
export type MealKind = typeof mealKinds[number];
export const defaultMealPreferences = { lunch: { enabled: true, startTime: '13:00', endTime: '14:00', durationMinutes: 45 }, nearbyMeters: 1500, maxExtraMinutes: 15, maxExtraMeters: 2000 };
const mealWindowSchema = z.strictObject({ enabled: z.boolean(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().min(15).max(120) }).refine(m => !m.enabled || m.startTime < m.endTime, 'The meal arrival window must end after it starts.');
export const mealPreferencesSchema = z.strictObject({ lunch: mealWindowSchema, dinner: mealWindowSchema.optional(), nearbyMeters: z.number().int().min(100).max(3000), maxExtraMinutes: z.number().int().min(0).max(30), maxExtraMeters: z.number().int().min(0).max(5000) }).transform(({ dinner: _legacyDinner, ...meals }) => meals);
export const mealDetourSchema = z.strictObject({ extraMinutes: z.number().finite().nonnegative(), extraMeters: z.number().finite().nonnegative(), fromPreviousMeters: z.number().finite().nonnegative() });
export const guidePreferencesSchema = z.strictObject({
  interests: z.array(z.enum(interests)).max(12).default(['history', 'culture']), pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  groupType: z.enum(['unspecified', 'solo', 'couple', 'friends', 'family', 'seniors']).default('unspecified'), environment: z.enum(['any', 'indoor', 'outdoor']).default('any'),
  visitorPricing: z.enum(['auto', 'indian', 'foreign']).default('auto'), mealPriceTier: z.enum(['auto', 'budget', 'standard', 'premium']).default('auto'),
  mobility: z.enum(['standard', 'limited', 'wheelchair']).default('standard'), travelMode: z.enum(['DRIVE', 'WALK', 'BICYCLE']).default('DRIVE'),
  adults: z.number().int().min(1).max(12), childAges: z.array(z.number().int().min(0).max(17)).max(11),
  groupBudget: z.number().finite().nonnegative().nullable(), perPersonBudget: z.number().finite().nonnegative().nullable().default(null), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  dietaryRules: z.array(z.string().max(40)).max(8), visitedPlaceIds: z.array(z.string().max(10000)).max(30).default([]),
  meals: mealPreferencesSchema.optional(),
  mealBreak: z.boolean().default(true), restBreaks: z.boolean().default(true), bufferMinutes: z.number().int().min(0).max(45).default(10),
  mealGroupEstimate: z.number().finite().nonnegative().nullable().default(null), transportGroupEstimate: z.number().finite().nonnegative().nullable().default(null),
  transportPerKmEstimate: z.number().finite().nonnegative().nullable().default(null),
  notes: z.string().max(1200).default(''), useAI: z.boolean().default(true),
}).refine(p => p.adults + p.childAges.length <= 12, { message: 'At most 12 travelers. Reduce Adults or Children.', path: ['adults'] }).refine(p => p.groupType !== 'solo' || p.adults + p.childAges.length === 1, { message: 'Solo requires exactly one traveler. Set Adults to 1 and Children to 0, or choose another Group type.', path: ['groupType'] }).refine(p => (p.groupBudget === null && p.perPersonBudget === null && p.mealGroupEstimate === null && p.transportGroupEstimate === null && p.transportPerKmEstimate === null) || !!p.currency, { message: 'Select a budget currency when entering any budget or cost estimate.', path: ['currency'] }).transform(p => ({ ...p, meals: { ...defaultMealPreferences, ...p.meals, lunch: { ...defaultMealPreferences.lunch, durationMinutes: p.meals?.lunch.durationMinutes ?? 45, enabled: p.mealBreak } } }));
export type GuidePreferences = z.infer<typeof guidePreferencesSchema>;
const costShape = { minimum: z.number().finite().nonnegative(), maximum: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/), basis: z.enum(['person', 'group']) };
export const costEstimateSchema = z.strictObject(costShape).refine(c => c.maximum >= c.minimum, 'Maximum must follow minimum.');
export const costSchema = z.strictObject({ ...costShape, source: z.enum(['reviewed_catalog', 'user_estimate', 'published_estimate', 'planning_estimate']), sourceUrl: z.url().nullable(),
  note: z.string().max(600).optional(), checkedAt: z.iso.datetime().optional(),
  tariff: z.strictObject({ indianAdult: z.number().nonnegative(), foreignAdult: z.number().nonnegative(), category: z.enum(['indian', 'foreign']).nullable(), suggestedByCurrency: z.boolean(), currency: z.literal('INR') }).optional(),
  childRate: z.strictObject({ belowAge: z.number().int().min(1).max(18), minimum: z.number().nonnegative(), maximum: z.number().nonnegative() }).optional(),
  original: z.strictObject({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).optional(),
  exchange: z.strictObject({ rate: z.number().positive(), date: z.iso.date(), sourceUrl: z.url() }).optional(),
}).refine(c => c.maximum >= c.minimum, 'Maximum must follow minimum.');
export type GuideCost = z.infer<typeof costSchema>;
export const guideFactsSchema = z.strictObject({
  categories: z.array(z.enum(interests)).max(12), environment: z.enum(['indoor', 'outdoor', 'unknown']), rating: z.number().min(0).max(5).nullable(), reviews: z.number().int().nonnegative().nullable(),
  hours: z.strictObject({ status: z.enum(['date_specific', 'usual', 'unknown', 'closed']), windows: z.array(z.strictObject({ opens: z.iso.datetime(), closes: z.iso.datetime() })).max(20), description: z.array(z.string().max(500)).max(10), source: z.enum(['google', 'reviewed_catalog']).optional(), sourceUrl: z.url().nullable().optional() }),
  mealServices: z.strictObject({ lunch: z.boolean().nullable(), dinner: z.boolean().nullable().optional() }).optional(),
  admission: costSchema.nullable(), mealCost: costSchema.optional(), mealReserve: costSchema.optional(), pricingExchange: z.strictObject({ rate: z.number().positive(), date: z.iso.date(), sourceUrl: z.url() }).optional(), priceLevel: z.string().max(60).optional(), accessible: z.boolean().nullable(), goodForChildren: z.boolean().nullable(), vegetarianOptions: z.boolean().nullable(),
  containingPlaceIds: z.array(providerPlaceId).max(10).optional(), website: z.url().nullable(), providerUri: z.url().nullable(), description: z.string().max(2500).nullable(), checkedAt: z.iso.datetime(),
});
export type GuideFacts = z.infer<typeof guideFactsSchema>;
export const candidateSchema = z.strictObject({ receipt: z.string().regex(/^[A-Za-z0-9_-]{40,50000}$/).optional(), location: locationSchema, facts: guideFactsSchema, suggestedMinutes: z.number().int().min(10).max(240), reasons: z.array(z.string().max(500)).max(10), score: z.number().finite() });
export type GuideCandidate = z.infer<typeof candidateSchema>;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const guideDiscoverSchema = z.strictObject({ destinationId: z.string().uuid(), date: z.iso.date(), preferences: guidePreferencesSchema });
export const guideCandidateRequestSchema = guideDiscoverSchema.extend({ locationId: z.string().uuid() });
export const guideStopSchema = z.strictObject({ mealKind: z.enum(['lunch', 'dinner']).optional(), locationId: z.string().uuid(), durationMinutes: z.number().int().min(10).max(240), mustVisit: z.boolean(), locked: z.boolean(), preferredTime: clock.nullable(), costEstimate: costEstimateSchema.nullable(), durationSource: z.enum(['category_estimate', 'gemini_estimate', 'user']).optional(), baseDurationMinutes: z.number().int().min(10).max(240).optional(), timeBand: z.enum(['any', 'morning', 'afternoon', 'evening']).optional() });
export type GuideStop = z.infer<typeof guideStopSchema>;
export const savedGuideSchema = z.strictObject({ preferences: guidePreferencesSchema, stops: z.array(guideStopSchema.omit({ locationId: true }).extend({ placeId: providerPlaceId })).max(5) });
export type SavedGuide = z.infer<typeof savedGuideSchema>;
export const guidePlanRequestSchema = z.strictObject({ destinationId: z.string().uuid(), startId: z.string().uuid(), endId: z.string().uuid().nullable(), returnToStart: z.boolean(), allowOutsideStart: z.boolean(), date: z.iso.date(), startTime: clock, endTime: clock, preferences: guidePreferencesSchema, orderMode: z.enum(['smart', 'manual']), chosenPlaces: z.boolean().optional(), stops: z.array(guideStopSchema).min(1).max(8) }).refine(v => v.returnToStart || !!v.endId, 'Choose a return point.').refine(v => new Set(v.stops.map(s => s.locationId)).size === v.stops.length, 'Choose each place once.').refine(v => !v.chosenPlaces || (v.orderMode === 'smart' && !v.preferences.useAI && v.stops.length <= 5 && v.stops.every(s => s.mustVisit)), 'Chosen-place optimization requires one to five required visits and AI selection switched off.');
export type GuidePlanRequest = z.infer<typeof guidePlanRequestSchema>;
export const guideRankingSchema = z.strictObject({ rankedIds: z.array(z.string().uuid()).max(8), interests: z.array(z.enum(interests)).max(12), visits: z.array(z.strictObject({ locationId: z.string().uuid(), durationMinutes: z.number().int().min(10).max(240), timeBand: z.enum(['any', 'morning', 'afternoon', 'evening']) })).max(8).optional() });
export type GuideRanking = z.infer<typeof guideRankingSchema>;
export const guideDiscoverySchema = z.strictObject({ candidates: z.array(candidateSchema).max(8), warnings: z.array(z.string()).max(30), assistantMode: z.enum(['local', 'openai', 'gemini']) });
export const guidePlanSchema = z.strictObject({
  itinerary: liveItinerarySchema, orderMode: z.enum(['smart', 'manual']), assistantMode: z.enum(['local', 'openai', 'gemini']),
  interestCoverage: z.array(z.strictObject({ interest: z.enum(interests), status: z.enum(['included', 'not_scheduled']), places: z.array(z.string().max(300)).max(7), reason: z.string().max(800).optional() })).max(12).optional(),
  stops: z.array(z.strictObject({ mealKind: z.enum(['lunch', 'dinner']).optional(), mealDetour: mealDetourSchema.optional(), locationId: z.string().uuid(), facts: guideFactsSchema, cost: costSchema.nullable(), groupCost: costEstimateSchema.optional(), mealCost: costSchema.optional(), reasons: z.array(z.string()).max(12), bufferMinutes: z.number().nonnegative(), travelMinutes: z.number().nonnegative(), waitingMinutes: z.number().nonnegative(), durationSource: z.enum(['category_estimate', 'gemini_estimate', 'user']).optional(), baseDurationMinutes: z.number().int().min(10).max(240).optional(), timeBand: z.enum(['any', 'morning', 'afternoon', 'evening']).optional(), hoursStatus: z.enum(['date_specific', 'usual', 'unknown']) })).min(1).max(7),
  breaks: z.array(z.strictObject({ kind: z.enum(['meal', 'rest']), afterLocationId: z.string().uuid(), starts: z.iso.datetime(), ends: z.iso.datetime(), note: z.string() })).max(10),
  budget: z.strictObject({ currency: z.string().nullable(), groupKnownMinimum: z.number().nonnegative(), groupKnownMaximum: z.number().nonnegative(), perPersonKnownMinimum: z.number().nonnegative(), perPersonKnownMaximum: z.number().nonnegative(), groupLimit: z.number().nullable(), unknowns: z.array(z.string()).max(20), status: z.enum(['unknown', 'within_estimates', 'over']),
    breakdown: z.strictObject({ people: z.number().int().min(1).max(12), tickets: z.strictObject({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative() }), food: z.strictObject({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative() }), transport: z.strictObject({ minimum: z.number().nonnegative(), maximum: z.number().nonnegative() }) }).optional(),
  }),
  assumptions: z.array(z.string()).max(30), excluded: z.array(z.strictObject({ locationId: z.string().uuid(), reason: z.string() })).max(8),
  comparison: z.strictObject({ originalTravelMinutes: z.number().nonnegative().nullable(), selectedTravelMinutes: z.number().nonnegative(), evaluatedSequences: z.number().int().nonnegative() }),
});
export type GuidePlan = z.infer<typeof guidePlanSchema>;
export const guidePlanStyles = ['sightseeing', 'less_travel', 'relaxed'] as const;
export type GuidePlanStyle = typeof guidePlanStyles[number];
export const guideComparisonOptionSchema = z.discriminatedUnion('status', [
  z.strictObject({ style: z.enum(guidePlanStyles), status: z.literal('ready'), plan: guidePlanSchema, sameAs: z.enum(guidePlanStyles).optional() }),
  z.strictObject({ style: z.enum(guidePlanStyles), status: z.literal('unavailable'), code: z.string().max(100), reason: z.string().max(1000) }),
]);
export const guideComparisonSchema = z.strictObject({ options: z.array(guideComparisonOptionSchema).length(3) }).refine(value => value.options.every((option, index) => option.style === guidePlanStyles[index]), 'Each plan style must appear once in the expected order.');
export type GuideComparison = z.infer<typeof guideComparisonSchema>;
export type TravelMatrix = Array<Array<{ durationSeconds: number; distanceMeters: number } | null>>;
