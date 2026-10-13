# Daywise — real starting locations

City-independent travel planning with real provider-backed destination, source, visit and return selection. The normal app starts with empty location fields. It does not choose a city from GPS, substitute a demo address or generate fictional locations when a provider fails.

## Run locally

Node 20.19 or newer is required by the pinned toolchain.

```powershell
npm ci
npm run dev:api
# In a second terminal:
npm run dev
```

Open http://127.0.0.1:5173/. Follow [location-setup.md](location-setup.md) to configure Places API (New), Geocoding, Time Zone, Routes and the optional interactive Google map. Local auth needs no Firebase account, but real Google services need configured keys and billing. No account or paid resource is created automatically. Missing configuration is reported with actionable errors and no sample fallback.

## What the real flow does

- Search and select any provider-supported city, locality, address, hotel, landmark, airport or station. Destination city remains separate from the actual starting point.
- Use current location only after a click and browser permission. Reverse geocoding supplies its address, while browser coordinates and accuracy remain explicit. Denial/timeouts retain manual search.
- Use a searched place to replace GPS, or choose a start by clicking the Google map. Typed text is never a confirmed location until a valid provider selection resolves.
- Review outside-city/unverified starts explicitly. Same-place return follows the selected source; a separate return requires a valid location.
- Build a real Google driving itinerary through up to five selected visits, optionally optimize their order, review times and accept an independent route. Per-leg links open external Google Maps navigation.
- Retain party/budget/food preferences, manual booked/actual amounts and version-bound manual progress/return reports. Prices and dietary/venue facts are not invented by routing.
- Save private day preferences and allowed location references. Reopening fetches current provider data and requires a fresh route review. Raw provider addresses, geometry and traffic schedules are not persisted.

Driving predictions plus your visit allowances are not a complete venue feasibility check. Venue hours, admission, fees, dietary preparation and accessibility still require independently reviewed data. Budget feasibility is unknown without those prices. Return time is checked against driving plus allowances, and later traffic can change during stops. The app does not track location continuously or automatically infer completed visits/arrival.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check:release
```

Playwright always starts isolated fixture regression servers on 5174/3002 with fresh private `.tmp` storage and zero paid-call allowances. Real-location journeys mock provider responses and synthetic browser coordinates only in tests. They do not read your position or use your paid account. Production builds exclude fixture location UI/modules; `check:release` scans for known fixture identities and private server key values. An occupied check port fails rather than reusing unrelated code.

## Architecture and privacy

- `apps/web/src/LiveApp.tsx`: normal real-provider workflow, private preferences, review/acceptance.
- `apps/web/src/components/LocationField.tsx`: debounced accessible autocomplete, one-shot GPS, error/race handling.
- `apps/web/src/components/ProviderMap.tsx`: Google route geometry, markers and explicit pin selection.
- `packages/contracts/src/locations.ts`: validated selected locations, route inputs and structured itinerary.
- `packages/data-adapters/src/google-locations.ts`: server-only Google lookups; `google.ts` supplies routing.
- `apps/api/src/locations.ts`: owner-bound transient receipts; live endpoints are registered in `server.ts`.
- `packages/domain/src/live-itinerary.ts`: destination-local schedule from real provider legs and user allowances.

Google addresses/suggestions/routes stay transient; the backend receipt registry expires selections after 30 minutes and never persists provider responses. Saving stores allowed place IDs and your own preferences/reports, plus GPS/pin points only on your explicit Save action. Re-opening re-resolves them; a saved coordinate is labeled as saved, not a current GPS reading. API logs omit query bodies/coordinates/raw provider URLs, and server credentials never use a `VITE_` prefix. The Maps JavaScript browser key is public and must be restricted.

Normal API startup cannot enable fixtures, and local development authentication cannot run in production. Firebase production authentication, provider licensing/account behavior, shared multi-instance guards, real venue facts, privacy/operator review, field trials and deployment remain release gates. See [operations.md](operations.md) and [location-setup.md](location-setup.md).

## Historical milestones

[Milestone 17](milestone-17.md) documents the real-location implementation and its root causes. Earlier milestones 1–16 describe the prior fixture testing foundation. Their records in `daywise-m1` and legacy backend storage remain untouched, but are never loaded as real locations or used as live routing fallbacks. The historical fixture UI is available only in the isolated development test harness, not normal startup or the production build. [Phase A](phase-a-validation.md), [Phase B](phase-b-mvp.md) and [Phase C](phase-c-architecture.md) remain background scope/architecture reviews, not evidence of real-world venue validation or customer trials.
