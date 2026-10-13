# Real-location implementation

12 October 2026. Replaces the normal fixture entry flow with real-provider starting locations, destinations, autocomplete and driving itineraries. Google is reused from the project's existing adapters; no dependencies are added.

## Root causes and changes

The earlier GPS button captured a preview but never entered the trip contract. Manual lookup searched only two fictional anchors. Destination choices came from static fixture cities, and generation used abstract edges keyed by fixture IDs. The existing Google route endpoint accepted only pre-reviewed catalog anchors, so adding coordinates to that form alone could not produce a real route.

The normal React entry now uses `LiveApp` and has no location defaults. New strict location/live-route contracts are separated from the historical fixture contracts. `GoogleLocations` implements Places API (New) autocomplete/details, reverse geocoding and timezone lookup. `GoogleRoutes.itinerary` extends the existing provider with intermediate waypoints, actual route legs and validated optimized order. `/api/plans/live` resolves owner-bound location receipts to coordinates and builds a structured itinerary; it never reads the synthetic graph.

Normal API startup permanently disables fixture locations. The old UI/domain fixtures are retained only for isolated regression testing, protected by development + CI + fresh harness-path checks. A production artifact check rejects known fixture location identities, and the client-secret scan covers the new server keys too. Existing IndexedDB/backend records are preserved; no fictional record is migrated to a live source.

## Behavior and boundaries

- Location is read once only after clicking the current-location button. Coordinates retain their browser values; Google resolves the address. Loading, denial, unavailable/insecure context, timeout, invalid response and retry/manual recovery are explicit. Duplicate activation is guarded synchronously. Late GPS/search/details/route/pin responses cannot overwrite newer choices.
- Autocomplete uses 350ms debouncing, cancellation and per-field Google session tokens. It supports city-only destination searches and unrestricted source/visit/return searches with optional destination bias. Arrow keys, Enter and Escape work with labeled listboxes. Typing invalidates a selection; only validated provider detail/reverse responses confirm it.
- Source and trip city are independent. Canonical provider locality IDs establish a match. A different or unverified start requires explicit travel-from-source consent or a newly chosen in-city source, enforced again on the server. At least one visit must belong to the selected destination. Nothing changes the trip city automatically.
- Same-place return uses the current selected source, including a replacement. A different return requires its own validated selection. The Google map has real markers/route geometry; click-to-place-start requires reverse lookup. The map has no default coordinates and is reused across edits. API/map failures show actionable errors.
- Selected coordinates feed Google Routes, waypoint optimization, destination-local timeline calculation and external navigation links. Acceptance preserves an independent route; draft edits and late callbacks cannot replace it. Venue hours, food/accessibility evidence, prices and complete budget feasibility remain unknown rather than being fabricated. Time at visits is user-selected allowance.
- Group/budget/food preferences, whole-category booked/actual reports and manual progress/return reports remain available in the real flow. Actual replaces booked without double-counting. New acceptance requires expense review. Reports bind to the accepted route and do not infer location or arrival. Saved real-day preferences use allowed provider IDs and explicit user-owned coordinates/records; re-opening performs fresh provider resolution and route review.

Server location receipts are owner-bound and expire in 30 minutes; they are not durable provider-content storage. Lookups share existing authenticated request limits and per-process provider-attempt allowances. Browser private keys never enter the frontend. The browser map uses its separate, deliberately public restricted key. Provider addresses, suggestions, city facts, geometry and schedules are not saved in IndexedDB. Own preferences/reported records use a separate `daywise-live` database; old `daywise-m1` records remain untouched.

## Setup and verification

Follow **location-setup.md** for the required enabled Google APIs, server/browser key restrictions, billing, quotas, privacy/terms drafts and operating limits. No live key, billing account or cloud resource was created. Without credentials, normal startup shows configuration errors and empty location fields. Live-account behavior must be checked after setup.

Added provider/domain/API tests cover real request construction, required data, provider failure/empty/invalid responses, locality/timezone extraction, coordinate preservation, validated route order, receipt ownership/expiry, starting-city consent, return source, attempt limits, production fixture refusal, saved-data restrictions and client credential/fixture scans. Browser journeys cover actual API flow with mocked provider responses, synthetic GPS, manual/keyboard selection, denial/timeouts, duplicate/stale requests, mismatch choices, return changes, navigation, map pins, saved references, immutable acceptance, costs and manual reports.

`npm run check:release` runs the complete retained regression suite and records point-in-time evidence in `artifacts/release/report.json`. Production/live release approval remains separate; a real driving route does not establish independently verified venue or traveler-trial evidence.
