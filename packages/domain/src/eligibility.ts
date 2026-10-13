import type { Place, TripInput } from '../../contracts/src';
export function eligible(place: Place, input: TripInput): boolean {
  return !input.excludedPlaceIds.includes(place.id)
    && (!input.stepFree || place.stepFree === 'supported')
    && (!input.childAges.length || place.childFriendly)
    && (!place.hiddenGem || input.includeHiddenGems || input.mustVisitIds.includes(place.id))
    && (place.category !== 'food' || input.dietaryRules.every(rule => place.dietary[rule] === 'supported'));
}
