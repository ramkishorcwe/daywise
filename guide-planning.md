# Daywise day guide: implementation and setup

## Use the feature

Open the existing planner, confirm a destination and starting location, and choose a date and start/return times. Set optional interests, pace, group, mobility and cost preferences, then choose **Plan my day**. The guide discovers the candidates, chooses the visits and calculates their order automatically. The main screen has no Visit 1/Visit 2, add-attraction or manual candidate-selection form.

Review the schedule, source information, unknown costs and route before accepting. Optional review adjustments let you shorten a visit, remove a generated stop, lock a must-visit, set an appointment or rearrange the generated sequence; changes recalculate the preview. Manual order stays manual until you choose **Optimize route**. Must-visits and position locks constrain optimization. The accepted day remains separate from an edited preview.

## Root causes and resulting pipeline

The earlier manual planner took the supplied stops and optionally requested Google waypoint optimization. It did not discover attractions, compare alternative subsets, incorporate opening windows or use admission costs to select stops. Waypoint optimization alone cannot account for visit allowances, locks, appointments, meals or budgets. The previous one-stop Google optimization failure was separately fixed by omitting provider optimization when there is only one intermediate stop.

The guide now follows this pipeline:

1. Validate owner-bound destination, origin and return selections using the existing location registry. Actual selected coordinates flow to routing. No city, address, coordinates or itinerary are supplied as a production fallback.
2. Search Google Places (New) using the selected city, its coordinates and interests. Deduplicate provider IDs and discard closed, unlocated or irrelevant results. Reverse-geocode candidate coordinates to establish their actual locality. Review a bounded shortlist of up to eight places. Request actual Google containing-place IDs and deprioritize separately listed sub-attractions in the same nearby complex so one palace is not counted as several full visits. Nearby distinct attractions remain eligible; must-visits and locks still take precedence.
3. Read real provider opening periods, ratings, types and available accessibility/family/vegetarian flags. Usual weekly hours and unknown hours remain distinct from published date-specific periods. Provider categories and visit-duration recommendations are explicitly inferred/estimated. Ratings are popularity evidence, not proof of heritage significance or uniqueness.
4. Optionally obtain a structured AI ranking of existing candidate IDs. Reject IDs outside the verified set. AI cannot provide coordinates, prices, hours or routes and cannot override constraints. Gemini receives the verified facts and actual directed travel matrix, chooses one to five recommended visits from the verified shortlist, and returns bounded visit-duration estimates and soft morning/afternoon/evening preferences alongside candidate priorities. Explicit user duration edits are preserved. A suggested time band is not verified venue guidance or a weather/sunset observation.
5. Request the actual directed Google travel-time matrix for the origin, candidates and final destination. Compare ordered subsets of up to five visits. Eight candidates require at most 100 matrix elements and 8,800 ordered subsets. Enforce must-visits, locked positions, preferred arrival times, return deadline, available opening windows, known budget limits and reported accessibility/child restrictions.
6. Score feasible choices by interest match, provider evidence, group suitability and travel/waiting costs. The choice can skip optional stops instead of manufacturing a longer, impossible day. Unknown essential costs prevent a budget-fit claim.
7. Request the final Google route in the selected application order, then independently reschedule using its actual leg estimates. Recheck opening windows, return time and distance-dependent transport estimates. Smart mode permits one bounded repair if the first final route does not fit: update the matrix edges using its actual returned leg estimates and consider fewer optional visits, keeping must-visits and locks; manual mode preserves the order or reports infeasibility.
8. Synchronize the existing map, numbered cards, highlights, navigation and explicit acceptance. Errors clear the proposed route while keeping choices editable.

The input-shortlist matrix comparison can include places omitted from the final day. It is not a controlled same-stop measurement of savings. Deterministic tests separately establish reduced travel for identical candidate sets where a better feasible order exists.

## Scheduling and budget behavior

- All schedule times use the selected destination timezone. The origin and destination remain separate; an origin outside the destination requires the existing explicit choice.
- A complete visit must fit inside an available opening window. Unknown hours can be included only with visible confirmation requirements; published hours can still change.
- Visit durations, arrival buffers and meal/rest allowances are editable estimates. Include meal defaults on and adds one nearby midday restaurant only when the selected tour reaches 13:00–14:00. Unchecking excludes all meal allowances. Rest pauses are independent; preparation and prices remain unverified.
- Drive estimates represent one departure request; later traffic may differ. Walking/cycling estimates are static. No live congestion, event or road-closure observations are fabricated.
- Admission ranges come from independently reviewed evidence or clearly labeled user estimates. Google price levels are not converted into entrance fees. Unknown admission is never treated as free.
- Per-person admission is multiplied by all travelers; group charges are added once. Group and per-person subtotals and limits are separate. Where both limits exist, the stricter equivalent group limit applies. Age-specific tickets remain unverified.
- Optional group meal/transport estimates and group transport cost per kilometre affect selection and update with real route distance. Currencies are not converted. Parking, unknown activities and other essential unknowns stay visible.
- Existing navigation uses actual coordinates, eligible place IDs and the correct drive/walk/bicycle mode. GPS and map pins retain their exact selected coordinates. The return-to-start setting uses the current validated origin; a different return selection is preserved when that setting is off.

## Files and responsibilities

| File | Purpose |
| --- | --- |
| `packages/contracts/src/guide.ts` | Validated preferences, provider facts, constraints, review and saved-user-data contracts. |
| `packages/contracts/src/api.ts` | Extend supported route modes and static-estimate metadata. |
| `packages/domain/src/guide-planner.ts` | Candidate scoring, visit allowances, constrained subset/order search, budget and final schedule validation. |
| `packages/data-adapters/src/google-guide.ts` | Real Places discovery/details and opening-period normalization. |
| `packages/data-adapters/src/google.ts` | Real route matrix, walking/cycling and existing single-stop optimization fix. |
| `packages/data-adapters/src/catalog.ts` | Optional reviewed admission ranges and dated opening evidence. |
| `packages/data-adapters/src/assistant.ts` | Grounded structured ranking through the existing configured OpenAI interpreter. |
| `apps/api/src/guide.ts` | Protected discovery, enrichment and planning routes with transient facts and existing spend guards. |
| `apps/api/src/server.ts`, `main.ts`, `assistant.ts` | Wire providers, expose guide configuration and reuse AI limits. |
| `apps/web/src/components/AutoGuidePanel.tsx`, `GuideReview.tsx`, `guide.css` | Automatic preference-first planning, review-only adjustments, cached draft restoration, recalculation and explicit acceptance. |
| `packages/data-adapters/src/gemini.ts` | Server-only REST structured Gemini planning and validated action interpretation. |
| `tests/gemini.test.ts` | Strict Gemini response validation, secret placement, malformed/unknown IDs and failure handling. |
| `apps/web/src/guide-api.ts`, `location-api.ts` | Reuse authenticated transport and validate guide responses. |
| `apps/web/src/LiveApp.tsx`, `live-storage.ts` | Integrate mode, preview, accepted day and saved own preferences. |
| `apps/web/src/components/ProviderMap.tsx`, `maps-navigation.ts` | Synchronized map selection and shared actual-coordinate navigation. |
| `apps/web/public/privacy.html` | Explain provider requests, optional AI notes and saved own data. |
| `tests/guide.test.ts`, `tests/e2e/guide.spec.ts` | Deterministic provider/domain/API tests and browser journeys. |

## Google configuration

The existing Google keys are configured in the private root `.env`. Successful live checks confirmed Places, Geocoding, Time Zone, route calculation and browser map access. Firebase credentials do not substitute for Maps API keys.

Keep server keys in `GOOGLE_PLACES_API_KEY`, `GOOGLE_GEOCODING_API_KEY`, `GOOGLE_TIME_ZONE_API_KEY` and `GOOGLE_ROUTES_API_KEY`. One server key may cover these four APIs. Restrict it to these APIs and the backend's actual public outgoing IP addresses. A local ISP IP can change; an IP rejection needs a Cloud restriction update, not a fictional-location fallback.

Keep a **different**, public browser map key in `VITE_GOOGLE_MAPS_BROWSER_KEY`, restricted to Maps JavaScript API and the exact website referrers, currently `http://127.0.0.1:5173/*` and `http://localhost:5173/*`. Add the actual production domain when deployment is reviewed. Never use a server key in a `VITE_` field.

Enable Places API (New), Geocoding API, Time Zone API, Routes API and Maps JavaScript API in the key's project with active billing. The guide's requested Places fields and route matrix are billable; a matrix is charged per element. The existing daily provider guard limits attempts, not a currency-denominated bill, and currently operates per backend instance. Review quotas and actual usage before public deployment.

After environment changes restart `npm run dev:api` and `npm run dev`. Browser keys are public by design; server keys and service-account JSON remain private and ignored. Firebase service-account configuration is currently preserved separately in `.local/firebase-admin.json`; authentication remains local until a separate Firebase configuration and validation is performed. See [location-setup.md](location-setup.md) for the existing location setup.

Primary documentation: [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Place fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places), [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix), [Maps security](https://developers.google.com/maps/api-security-best-practices).

## Gemini configuration

This project now uses `ASSISTANT_MODE=gemini`. The key was copied from the local environment file supplied by the user into this project's private `.env`, without changing that external project. No key value was printed or added to the client.

```dotenv
ASSISTANT_MODE=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
AI_DAILY_LIMIT=20
```

The blank key above is documentation only; the real local `.env` is configured. The original model alias in the supplied file returned a service error. The accessible stable `gemini-3.1-flash-lite` model passed a structured request and was selected instead. The app sends the key in the server `x-goog-api-key` header, never in a URL or VITE field. Actual field support was verified against the account; the request uses `responseMimeType` and `responseJsonSchema`. Retain access to the Generative Language API and its model quota/billing independently of Google Maps billing. After environment changes restart the API; `/api/locations/config` reports `guideAssistant: "gemini"`.

Gemini sees trip preferences/notes, candidate names and factual metadata, opening evidence and travel-time comparisons. Captured GPS coordinates are excluded. Responses are schema-validated and every referenced candidate ID must belong to the provider-verified set. Gemini estimates are labeled estimates, not measured average visit durations or verified best visiting conditions. A failed Gemini request reports an error and never silently presents local output as Gemini. Users can explicitly turn AI off to use local rules. No account-wide retention guarantee is implied.

The existing OpenAI adapter remains available with its server-only `OPENAI_API_KEY`, `OPENAI_MODEL` and `ASSISTANT_MODE=openai`. It was not called during this Gemini validation. Local mode is also available explicitly through `ASSISTANT_MODE=local`.

Primary references: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Generate Content API](https://ai.google.dev/api/generate-content), [available models](https://ai.google.dev/gemini-api/docs/models).

## Optional reviewed attraction evidence

`CHECKED_CATALOG_PATH` can point to the existing private checked catalog. Each actual location needs licensed or independently collected evidence with HTTPS source, method, rights, checked date and future validity date, an actual Google place ID, and city status `route_review`. Optional `admission` includes minimum/maximum, currency and person/group basis. Optional `openingHours` includes the actual date and ISO opening/closing windows. Expired evidence is excluded. Do not manufacture entries or persist transient Google facts into this catalog.

No verified admission catalog or restaurant preparation evidence has been supplied for this validation. The working UI therefore shows unknown admission and dietary information. Detailed heritage interpretation, uniqueness, best lighting/shade, special events and branch-level dietary guarantees are not inferred as verified facts.

## Validation and current limits

See [artifacts/guide-validation-report.json](artifacts/guide-validation-report.json), [live Gemini/Google evidence](artifacts/gemini-live-check.json) and [full local release checks](artifacts/release/report.json).

- Deterministic tests use test-only provider responses. The release harness blanks paid provider keys and uses isolated ports; the normal app continues using real providers.
- The authorized live Jaipur journey discovered eight real candidates, received date-specific periods for all eight, selected a feasible subset of visits within returned windows, calculated actual geometry, returned to the selected start, displayed unknown-cost warnings and successfully exercised manual reorder/reoptimization. Jaipur is a validation input, not a production restriction.
- The current live evidence reports browser-console outcomes separately. Desktop and 390px mobile screenshots were inspected; mobile content fit without horizontal overflow. Automated journeys verify markers/navigation, actual-location propagation, GPS failure states and review behavior.
- Physical-device GPS was not read during this guide validation. The configured Gemini model is tested with real provider candidates. OpenAI model calls were not run. Mock adapter checks alone do not establish live model performance.
- Supports drive, walk and bicycle, dates within the provider-supported next-seven-day window, eight attraction candidates, five final attraction visits and one optional midday restaurant meal. Transit and more than five attraction visits are not implemented in this guide. Provider facts expire after 30 minutes and routes after five minutes; reopening a saved day obtains fresh facts. Only own preferences/notes/estimates/constraints and allowed place IDs are saved for the guide.
- This remains a local development validation. Existing public-release gates remain pending, including deployment, cloud authentication, shared spend guards, retention review, advisory ownership and traveler trials.


## Automatic midday meal

The planner shows one **Include meal** checkbox, checked by default. Uncheck it to exclude both restaurant meal stops and generic meal allowances. The selected tour must actually reach the destination-local 13:00–14:00 period; a morning, evening-only or early-finishing itinerary makes no restaurant request and adds no meal. A meal arrival can be between 13:00 and 14:00; the eating allowance may extend beyond 14:00 when restaurant opening hours and the trip deadline permit it. The default duration is 45 minutes. Duration and road detour limits remain editable under an optional details section; separate lunch/dinner time controls are removed.

The server supports five attractions plus one midday restaurant, preserving attraction order, locks and must-visits during insertion. It reserves meal time and allowed travel overhead only for a selected tour that reaches midday. If the first visit would finish after the midday window, the meal can be placed near the actual starting location before that visit. Google Nearby Search, actual opening and lunch-service evidence, directed road distances and the onward route remain required. Default limits are 1,500 metres from the preceding attraction, 15 extra travel minutes and 2,000 extra road metres. Final routing rechecks the meal, subsequent appointments/openings and the return deadline. If the needed meal cannot fit, the accepted itinerary remains unchanged and the user can adjust durations/limits or uncheck Include meal.

**Any food** and existing dietary choices are unchanged. Food preparation, prices and missing service evidence require direct confirmation. The group food estimate is counted once and independently reviewed entry/cover charges remain included. Map numbering, navigation, progress and saved preferences include the meal. Provider facts and geometry remain temporary; saved days retain only own preferences and allowed place IDs.

Dinner generation is removed. Old saved dinner preference fields are accepted solely for compatibility and discarded during parsing; regeneration follows the single-checkbox midday rule. Historical stored place IDs are not deleted. Existing records and other trip functionality remain readable.

No additional API key is needed. The existing server Places API (New), Geocoding and Routes keys and spend guards are reused. See [Google Nearby Search documentation](https://developers.google.com/maps/documentation/places/web-service/nearby-search) and [Routes usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing). Matrices remain bounded to ten points.

Coverage includes `tests/meals.test.ts`, API cases in `tests/guide.test.ts`, and mobile/saved-day/checkbox cases in `tests/e2e/guide.spec.ts`. Paid live testing is not required for this behavior change; isolated validation uses test providers.

## Trip sharing, local recovery and price ranges

The current live workspace is automatically saved in the browser under `daywise-live-active-v1`. Draft and accepted plans, accepted IDs, party/preferences, selected locations, price allowances and reported costs/progress are preserved separately. Writes are synchronous and schema validated; quota/access failures remain visible and keep the previous stored copy. Malformed/unsupported records are not overwritten. Delete local trip clears the active snapshot and its linked named preferences, then resets the workspace without allowing stale planner callbacks to recreate it. Unrelated browser storage and separately saved days are preserved.

Restoration makes no GPS request and no automatic paid location/route request. Existing checked/expiry timestamps remain unchanged. A saved route remains readable; locations must be explicitly refreshed before route editing or regeneration, and new acceptance still requires review. The existing server and named-preference ID-only persistence are unchanged. Review provider retention before public deployment.

Trip price summary uses the itinerary's whole-group minimum/maximum subtotal plus optional user-entered additional category ranges. These additional allowances are scoped to the exact route/budget and currency, never copied to a different plan. They are excluded from booked/actual ledgers and route feasibility calculations. Unpriced items remain explicit; a displayed range is never a provider quote or a guaranteed complete cost.

Share trip freezes a reviewed text copy with destination-local schedule, stops, public Google place links and an optional price range. Start/return addresses and coordinates require opt-in. Notes, diet, child ages, expenses, backend IDs/tokens and credentials are excluded. Native device sharing is offered when supported, with copy/download/manual-copy fallbacks. Shared files are static and do not receive revisions. No public hosted link is fabricated.

Planning preference validation names the exact field and explains its valid range or dependency. Go to field opens collapsed sections and focuses the marked control. Currency is required only when a monetary amount is supplied; Solo requires exactly one traveler. Validation runs before provider requests and keeps an accepted itinerary intact. Invalid upstream response data is reported separately from user input errors.
