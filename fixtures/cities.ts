import type { City, Place, TripInput } from '../packages/contracts/src';
import { today } from '../packages/domain/src/time-format';

// Every venue, price, opening hour, accessibility fact and edge below is invented
// for deterministic software testing. These are not verified travel recommendations.
function makeCity(id: string, name: string, timezone: string, currency: string, unit: number): City {
  const definitions: Array<[string, string, Place['category'], number, number, number, string]> = [
    ['gallery', 'Heritage Gallery', 'history', 70, 24, 32, 'A gentle introduction to the city’s stories.'],
    ['garden', 'Riverside Garden', 'nature', 50, 43, 57, 'An open-air pause with room to wander.'],
    ['courtyard', 'Craft Courtyard', 'culture', 60, 62, 39, 'Slow down and discover local making traditions.'],
    ['market', 'Old Quarter Market', 'shopping', 45, 77, 68, 'A colorful browse with time for small discoveries.'],
    ['viewpoint', 'Quiet Terrace', 'nature', 45, 82, 26, 'A lesser-known spot for a slower afternoon.'],
    ['museum', 'City Story Museum', 'history', 65, 35, 77, 'An indoor stop with an engaging story collection.'],
  ];
  const places: Place[] = definitions.map(([key, title, category, duration, x, y, description], index) => ({
    id: `${id}-${key}`, name: title, category, description, reason: description, point: { x, y }, durationMinutes: duration,
    opens: key === 'museum' ? '10:00' : '09:00', closes: key === 'gallery' ? '16:30' : '18:00', lastAdmission: key === 'gallery' ? '15:15' : '17:00',
    adultCost: [index % 2 === 0 ? 2 * unit : 0, index % 2 === 0 ? 2 * unit : 0],
    childCost: [unit, unit], childMaxAge: 12, dietary: {},
    stepFree: key === 'viewpoint' ? 'not_supported' : 'supported', walkingMinutes: key === 'viewpoint' ? 18 : 7,
    childFriendly: key !== 'viewpoint', hiddenGem: key === 'viewpoint',
  }));
  places.push({ id: `${id}-kitchen`, name: 'Garden Table', category: 'food', description: 'A relaxed sit-down lunch in the test catalog.', reason: 'A meal break with evidence for your selected food restrictions in this fixture.', point: { x: 50, y: 64 }, durationMinutes: 50, opens: '11:30', closes: '15:00', lastAdmission: '14:30', adultCost: [0, 0], childCost: [0, 0], childMaxAge: 12, foodCost: [3 * unit, 4 * unit], dietary: { vegetarian: 'supported', pure_vegetarian: 'supported', vegan: 'unknown', no_onion: 'supported', no_garlic: 'supported', no_root_vegetables: 'supported' }, stepFree: 'supported', walkingMinutes: 2, childFriendly: true, hiddenGem: false });
  places.push({ id: `${id}-cafe`, name: 'Corner Café', category: 'food', description: 'A second test meal option with a different evidence profile.', reason: 'An alternative meal with supported vegan options in the fixture.', point: { x: 68, y: 53 }, durationMinutes: 40, opens: '11:30', closes: '16:00', lastAdmission: '15:00', adultCost: [0, 0], childCost: [0, 0], childMaxAge: 12, foodCost: [4 * unit, 5 * unit], dietary: { vegetarian: 'supported', pure_vegetarian: 'unknown', vegan: 'supported', no_onion: 'unknown', no_garlic: 'unknown', no_root_vegetables: 'unknown' }, stepFree: 'supported', walkingMinutes: 2, childFriendly: true, hiddenGem: false });
  const anchors = [{ id: `${id}-stay`, name: 'Demo stay', point: { x: 16, y: 70 } }, { id: `${id}-station`, name: 'Demo station', point: { x: 18, y: 18 } }];
  // Synthetic edge matrix, not inferred travel from geographic coordinates.
  const durations = [
    [0, 12, 18, 20, 25, 14, 18, 17, 12, 20],
    [12, 0, 13, 15, 22, 24, 12, 16, 18, 15],
    [18, 13, 0, 12, 18, 23, 17, 10, 12, 11],
    [20, 15, 12, 0, 11, 19, 23, 13, 9, 12],
    [25, 22, 18, 11, 0, 15, 20, 12, 14, 10],
    [14, 24, 23, 19, 15, 0, 13, 24, 17, 19],
    [18, 12, 17, 23, 20, 13, 0, 19, 20, 17],
    [17, 16, 10, 13, 12, 24, 19, 0, 9, 8],
    [12, 18, 12, 9, 14, 17, 20, 9, 0, 10],
    [20, 15, 11, 12, 10, 19, 17, 8, 10, 0],
  ];
  const ids = [...anchors.map(a => a.id), ...places.map(p => p.id)];
  const travel = Object.fromEntries(ids.flatMap((from, i) => ids.map((to, j) => [`${from}|${to}`, { durationMinutes: durations[i][j], distanceKm: i === j ? 0 : Number((durations[i][j] / 4).toFixed(1)), walkingMinutes: i === j ? 0 : 2 }])));
  return { id, name, country: currency === 'INR' ? 'India' : 'Synthetic dataset', timezone, currency, currencyExponent: 2, catalogVersion: 'fixture-v1', places, anchors, travel, travelCostPerMinute: [Math.round(unit / 20), Math.round(unit / 15)], parkingPerVisit: [Math.round(unit / 4), Math.round(unit / 3)], miscellaneous: [unit, 2 * unit] };
}
export const cities: City[] = [makeCity('jaipur-test', 'Jaipur', 'Asia/Kolkata', 'INR', 10000), makeCity('harbor-test', 'Harbor City', 'America/New_York', 'USD', 500)];
export const getCity = (id: string) => cities.find(c => c.id === id);
export function defaultInput(city: City): TripInput {
  return { cityId: city.id, date: today(city.timezone), startTime: '09:00', endTime: '18:00', startAnchorId: city.anchors[0].id, endAnchorId: city.anchors[0].id, adults: 2, childAges: [], budgetMinor: city.currency === 'INR' ? 500000 : 25000, budgetBasis: 'group', currency: city.currency, reservePercent: 10, pace: 'balanced', interests: ['history', 'culture'], dietaryRules: ['vegetarian'], stepFree: false, maxWalkingMinutes: 120, includeHiddenGems: true, mustVisitIds: [], excludedPlaceIds: [] };
}
