# Milestone 2 — local backend and provider integration

Implemented on 9 October 2026, following the user's instruction to build local integration before creating Firebase or Google Maps accounts. This completes the **local integration portion** of M2. The connected real-data release remains pending account configuration, provider smoke tests and actual catalog verification. No cloud resource or public deployment was created.

## Run and use

Install with `npm ci`. Run `npm run dev:api` and `npm run dev` in separate terminals. Open http://127.0.0.1:5173, select **Data connections**, and choose **Connect backend**. The browser then sends future fixture itinerary calculations to the authenticated API; disconnecting restores worker-based planning. There is no silent switch to a fabricated live result.

Use **Save current preferences** to create a private backend trip. **Review server plan** generates a candidate without changing its confirmed snapshot; **Confirm backend plan** accepts that specific candidate against the expected trip and confirmed revisions. Reopening backend preferences creates a separate browser draft. Browser confirmations and backend confirmations are clearly separate records.

The development API binds only to `127.0.0.1:3001`. It issues signed, expiring local identities to loopback clients. A tab's token survives reload through session storage; closing the tab or an expired identity may lose access to that identity's server records. Refreshing a valid connection preserves identity. The local adapter is for development rather than cross-device authentication.

## API and persistence

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Public configuration capabilities, with no credentials or private data |
| `POST /api/dev/session` | Loopback-only development identity; absent in Firebase mode |
| `GET /api/cities` | Fixture capability summaries and current checked route catalogs |
| `POST /api/plans/preview` | Validate and generate/evaluate a fixture plan without storing it |
| `GET, POST /api/trips` | List up to 50 private records or create an owner-scoped trip |
| `GET, PATCH, DELETE /api/trips/:id` | Owner checks; edits/deletion require the expected revision |
| `POST /api/trips/:id/generate` | Generate a fixture candidate with a ten-minute review expiry |
| `POST /api/trips/:id/confirm` | Atomically accept a server-owned candidate; stale/cross-trip candidates are rejected |
| `POST /api/cities/:cityId/route` | Driving estimate between two current checked catalog locations |
| `GET /api/cities/:cityId/locations/:locationId/enrichment` | Transient Google Places details for a catalog-associated provider ID |

Mutations and previews require `Idempotency-Key`. Matching development requests share the same result; changed bodies using the same key return a conflict. Route calls use a metadata-only guard: duplicate keys cannot bill another call, and completed duplicates return a typed conflict rather than storing/replaying Google route content. No automatic upstream retries occur.

The default adapter serializes revisions and atomically replaces `.local/trips.json`; `.local` is ignored by Git. The signing secret is stored separately in that directory. Malformed persistent records fail startup rather than being overwritten. Local capacity is limited to 1,000 trips, 1,000 ordinary request-guard entries and 500 candidates/provider-guard entries. Empty or timed-out provider responses are not converted to routes.

Firebase adapters use anonymous browser authentication, Admin SDK token verification and Firestore transactions with ownership/revision checks. Browser Firestore access is denied in `firestore.rules`; the Admin SDK bypasses those rules, so the API enforces authorization. The owner/updated index is provided in `firestore.indexes.json`. Firebase configuration and emulator settings are documented in `.env.example`; no credentials were supplied and no Firebase emulator or cloud integration test was claimed completed.

## Maps, provider facts and catalog readiness

Google Routes requests specify the actual requested departure, `DRIVE`, `TRAFFIC_AWARE` and a narrow field mask. Responses contain source/fetch/expiry information and explicitly describe traffic as a prediction for departure. Checked location IDs resolve to catalog coordinates on the server; the API does not accept arbitrary URLs or a public arbitrary-coordinate paid proxy. [Compute Routes documentation](https://developers.google.com/maps/documentation/routes/compute_route_directions).

Google Places enrichment requests only the selected details and attributions. Names, tags and enrichment do not establish strict dietary compliance. No Google response is inserted into the independent catalog. [Place Details documentation](https://developers.google.com/maps/documentation/places/web-service/place-details).

Route geometry renders only on a Google map using an API/referrer-restricted browser credential. Server keys are never exposed through `VITE_` variables. Route estimates stay in component memory, expire after five minutes and disappear when the connection dialog closes. The five-minute display expiry is a product freshness rule, not permission to cache provider content. Public terms/privacy documents and attribution/licensing review are still prerequisites for a provider-connected public release. [Routes policies](https://developers.google.com/maps/documentation/routes/policies), [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

No checked real-city records are invented or shipped. Catalog import validates structure, IDs, coordinates, evidence dates and declared reuse rights. Only current `route_review` locations can be queried. A source declaration still needs human verification. The route inspector is separate from the itinerary solver: **live itinerary generation remains disabled** until date-specific hours/admission, fees, food/mobility evidence, walking/parking/toll costs and departure-aware leg reevaluation are integrated and tested. See `catalogs/README.md`.

## Security, reliability, performance and costs

Requests use strict runtime schemas, 32 kB body limits, an exact browser-origin allowlist, bearer identities, owner authorization, request limits and typed errors. Forged or expired local tokens fail verification. Foreign records return the same missing response as nonexistent IDs. Confirmation cannot accept a client-supplied plan. Request bodies, authorization tokens, route payloads and raw upstream diagnostics are excluded from routine logging. Security headers are installed.

The development provider allowance defaults to 100 calls per UTC day per process; `PROVIDER_DAILY_LIMIT=0` disables calls. Failed upstream attempts count. Route/enrichment endpoints are separately rate limited. No provider calls were made with the current configuration, and no paid resources were provisioned. The request allowance is not a monetary billing cap and resets on process restart. Google account quotas and billing controls remain necessary before connecting paid accounts.

The main frontend remains about 110 kB compressed; connection UI, Firebase auth and maps load separately. Server fixture calculations use the existing bounded solver. The API currently runs that small fixture solver in its single Node process. Hosted operation requires a worker pool for measured concurrent planning, a shared persistent request lease/counter, retention/identity recovery, operating metrics and real provider/license validation. In-memory candidates and request guards reset on restart, so users may need to regenerate reviews and request keys cannot promise duplicate prevention across crashes. No hosted or multi-instance reliability claim is made.

Firebase auth and rules guidance: [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [anonymous authentication](https://firebase.google.com/docs/auth/web/anonymous-auth), [server/rules authorization boundary](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Verification

50 domain/API/provider checks passed, including ownership, tampered/expired tokens, browser origins, strict input/body limits, concurrent idempotency, stale revisions, protected confirmation, deletion, atomic persistence, catalog expiry, missing provider responses, attribution and provider call limits. Provider tests use explicitly simulated responses; they do not establish real routing accuracy.

Seven Chromium browser journeys cover the original planner, backend connection, saving/review/confirmation, session restoration, deletion, phone layout and recovery after a simulated backend interruption. TypeScript and production build pass. Local visual/browser review covers the connection dialog at desktop and phone sizes. Production dependency audit reports zero known vulnerabilities at the time of verification; the lockfile includes compatible Firebase versions and overrides for patched transitive dependencies.

Run `npm test`, `npm run build`, `npm run test:e2e` and `node scripts/visual-check.mjs` to repeat checks. The last command requires both local servers. Remaining evidence: real Firebase/emulator verification, configured Maps/Routes/Places smoke tests, field route tests, complete checked itinerary facts and public-release review.
