# Real starting locations — Google setup

The normal app starts with no city, address or coordinate defaults. It uses the project's Google provider architecture: Places API (New) for autocomplete/details, Geocoding API for reverse lookup, Time Zone API for destination-local scheduling and Routes API for driving/waypoint optimization. The browser Geolocation API supplies a point only after **Use my current location**. Google Maps JavaScript renders selected points and lets users select a starting pin.

## Configure locally

1. Create/select a Google Cloud project with billing enabled. Enable **Places API (New)**, **Geocoding API**, **Time Zone API**, **Routes API** and, for the interactive map, **Maps JavaScript API**.
2. Copy `.env.example` to `.env`. Keep `.env` private and out of source control. Set these server-only values:

   ```dotenv
   GOOGLE_PLACES_API_KEY=your-restricted-server-key
   GOOGLE_GEOCODING_API_KEY=your-restricted-server-key
   GOOGLE_TIME_ZONE_API_KEY=your-restricted-server-key
   GOOGLE_ROUTES_API_KEY=your-restricted-server-key
   PROVIDER_DAILY_LIMIT=100
   ```

   Separate keys per API are supported. Autocomplete and its terminating Place Details use the same Places key/project and per-field session token. No server key may have a `VITE_` prefix. Restrict each server key to its necessary API and the server's real egress IP address(es); localhost requests reach Google through the host's public egress IP, not `127.0.0.1`. See [Google API security guidance](https://developers.google.com/maps/api-security-best-practices).
3. For map display/pin selection, create a **separate public browser key**, restricted to Maps JavaScript API and your website HTTP referrers. Configure `VITE_GOOGLE_MAPS_BROWSER_KEY`. For this local app, authorize `http://127.0.0.1:5173/*`; add `http://localhost:5173/*` only if you use that hostname. Use your actual HTTPS deployment origins for a release. This restricted browser key is intentionally visible; the four server credentials are not. See [Maps JavaScript troubleshooting](https://developers.google.com/maps/documentation/javascript/troubleshooting).
4. Run `npm run dev:api` and `npm run dev` in separate terminals. Restart the API after changing server keys; restart Vite after changing the browser key. Open `http://127.0.0.1:5173/`. There is no sample-location fallback if a service is missing or fails. `/api/locations/config` reports configuration booleans, never key values.

Local auth needs no Firebase project. Public production API startup still requires the existing Firebase authentication configuration; local-development auth and fixture locations cannot run in production. Do not expose the loopback development servers as a public service.

### Environment checks and existing Firebase credentials

The private root `.env` is read by API startup and Vite; `.env.example` is a template only. Local authentication and the local assistant remain the defaults. A Firebase Admin JSON file is not a Maps API key. `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` can reference an existing Firebase project/credential without activating it while `API_AUTH_MODE=local`. Enabling Firebase auth additionally requires the existing browser Firebase configuration, anonymous sign-in and Firestore setup; it is not required for these local location flows.

One private server Maps key may populate all four `GOOGLE_*_API_KEY` fields if its four APIs are authorized. `VITE_GOOGLE_MAPS_BROWSER_KEY` must be a different website-restricted key. The web startup/build refuses identical private/public keys or malformed browser key values before exposing any browser configuration. Invalid server values disable the affected provider and return field-only diagnostics in `/api/locations/config`; missing values leave unrelated features usable. Configuration booleans indicate valid key formatting/presence, not proof of billing, permissions or API restrictions. Restart both servers after updating keys.

`.env`, `secrets.txt` and credential text files are ignored by Git and denied by the local Vite filesystem server, including raw imports. Keep private credentials outside public assets. No production domain has been configured; authorize only the actual HTTPS domains you deploy. The public map key is intentionally visible, but no server key or Firebase private key belongs in the browser bundle.

### If “This browser origin is not allowed” appears

The API checks the browser's origin before authenticating or calling Google. In local authentication mode outside production, `http://127.0.0.1:5173` and `http://localhost:5173` are accepted for the same preview port. Other ports, schemes, hosts and opaque (`null`) origins are rejected. Restart the API to apply this change, then retry the lookup. The accepted origin is echoed in CORS responses; no wildcard is allowed.

`WEB_ORIGIN` is the **website** origin, not the API address (`3001`). Set it to the scheme, hostname and port shown in the browser, with no path/query/credentials. If unset, the API derives it from `WEB_PORT` (default `5173`). When changing ports, supply the same `WEB_PORT` environment variable to both development commands; an explicit `WEB_ORIGIN` takes precedence. Firebase auth and production require the exact configured website origin and do not enable local aliases. For a public HTTPS site, set `WEB_ORIGIN=https://your-site.example` and restart the API. Do not authorize unrelated hosts to suppress this error.

An error asking to configure Places/Geocoding/Time Zone after this fix means origin checks succeeded and provider keys are missing. Browser location permission alone cannot supply reverse-geocoded addresses or city autocomplete; complete the Google setup above.

## Use the flow

Select a city suggestion in **Destination city**, then select **Starting location** by search, current-location button or map pin. Typing alone is not a confirmed selection. GPS reads have acquisition/overall timeouts, address resolution, accuracy display and explicit retry/manual recovery. Browser location can use GPS, Wi-Fi or its location service; this app cannot prove a sensor or independently verify a user's position.

Autocomplete is debounced 350 ms, with cancellation/sequence guards, per-field session tokens, loading/error/empty states and Arrow Up/Down, Enter and Escape controls. Queries are global; the selected destination only provides an optional geographical bias for other fields. No region, city or suggestion list is hardcoded. [Autocomplete API](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete).

GPS coordinates are retained exactly as supplied by the browser; reverse geocoding supplies an approximate address and canonical locality identity. A searched place uses provider details coordinates. A clicked map pin keeps the clicked point. No nearest demo point or default coordinate is substituted. [Reverse geocoding](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding).

City comparisons use the locality identity returned by reverse geocoding for both the destination and other selections. The destination retains its original searched place ID, address and coordinates separately. Places and Geocoding can return different IDs for the same city; comparing those IDs directly can falsely reject in-city starts and visits.

Google place IDs have no published maximum length. The shared validator accepts long IDs without truncation throughout location lookup, saved references and enrichment. API request bodies retain their existing size limit. [Google place ID guidance](https://developers.google.com/maps/documentation/places/web-service/place-id).

### Coordinates remain usable when an address is unavailable

A valid GPS fix is shown immediately, without revealing precise coordinates by default. **Show coordinates** is an explicit disclosure. If Google geocoding is unavailable, unconfigured, returns no result or exceeds the local allowance, the backend registers the original point with `address=null`, `city=null`, `placeId=null`, `provider=device` and `addressStatus=unresolved`. This is user-supplied coordinate data, not a fictional provider location. The UI explains the missing address and offers **Retry address lookup**, which reuses the captured point without another GPS read. GPS accuracy and observation time remain visible. Provider-returned locality, state and country are retained only when available.

If the backend itself cannot be reached, the interface still retains the point as a local, unregistered selection. Map display can use it, but routing remains blocked until authenticated receipt registration succeeds. Address retries with an old GPS observation request a fresh current-location read; existing registered selections have the normal receipt lifetime. An unresolved start needs explicit unverified-city consent before routing. Destination city/timezone and at least one destination visit still require provider verification. Google Routes then receives the exact selected coordinates, including the same point for return-to-origin.

Map selection is provisional: clicking places a pending pin and attempts address lookup. **Use this starting point** confirms it only after backend registration; **Cancel map selection** preserves the previous source and ignores late lookup responses. A registered point can be confirmed even when its address is unavailable. Form submission pauses during location lookup and pin review. The existing map instance is reused, and no route line appears until a Routes response succeeds.

Source names preserve the existing architecture: `search` means manual provider search, `pin` means a confirmed map pin, `gps` means a captured browser point and `saved` means a reopened user point. Production location schemas reject fixture sources; isolated fixtures keep their explicit test labels. Browser location requires HTTPS in production or a trusted localhost development context, and unsupported/permission/timeout errors offer manual recovery.

If the starting locality differs from the destination or cannot be established, choose **Travel from this starting location to my destination** or explicitly select an in-city start. Neither selection changes silently. At least one visit must be verified against the chosen destination city. Airports, hotels and addresses can still be outside-city starts with explicit consent. **Return to the same place** uses the selected source; unchecking it requires a separate valid return selection.

Choose up to five real visits and your time allowance at each. Scheduling uses the resolved destination timezone and a departure within the next seven days, rejects invalid/DST-ambiguous windows and checks driving plus allowances against Return by. **Let Google optimize visit order** uses real waypoint optimization; no internal fictional distance matrix participates. Review and accept the result; edits never replace an acceptance. [Time Zone API](https://developers.google.com/maps/documentation/timezone/requests-timezone), [Routes optimization](https://developers.google.com/maps/documentation/routes/opt-way).

Waypoint optimization is requested only for two or more visits. A single visit has one possible order, so it uses an ordinary Google route even when the optimization preference is enabled. Unused optimization metadata cannot reject that route; distances, durations, geometry and return legs still require a valid provider response. Multi-visit optimized orders must remain complete, unique and within range.

The browser loads timezone/date validation on demand after a destination timezone and travel date are selected. Generation waits for validation, and the backend independently enforces the same travel window. A failed validator download offers an explicit page reload with an unsaved-choice notice.

The Google map is centered only on selected/resolved coordinates or provider route geometry. Pin selection is explicit and reverse-geocoded before replacing the source. A missing browser key leaves the timeline and external navigation links usable; it does not fabricate a map. Navigation links pass validated coordinates and eligible place IDs to Google Maps. [Maps URLs](https://developers.google.com/maps/documentation/urls/guide).

Map initialization receives the selected point/geometry immediately. Coincident endpoints share a marker instead of forcing a degenerate close-up; numbered markers follow the provider-optimized itinerary order after a preview succeeds. Route bounds include both provider geometry and the selected points so the authoritative GPS/pin marker remains visible even when the road geometry is snapped nearby. Map-pin confirmation supports an unavailable address as described above; it does not require inventing one.

## Billing and request controls

These APIs require an enabled billing account and incur SKU-based charges. Autocomplete sessions end with Place Details, field masks affect details pricing, abandoned sessions may be charged per request, and waypoint optimization has a higher-tier charge. Map loads have separate billing. Consult the current [Places usage/billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing) and [Google cost controls](https://developers.google.com/maps/billing-and-pricing/manage-costs); no fixed price or free-usage promise is built into the app.

For controlled testing, verify the account's actual credits rather than assuming a trial; configure a billing budget/email alerts and supported API quotas; review API metrics and invoices. Firebase Blaze does not make all Maps requests free. Budget alerts are notifications, not spending caps. Debounced autocomplete, per-field session tokens, reused map instances and the provider allowance reduce unnecessary requests. Store/cache only eligible data under the applicable Google terms; the backend does not persist provider addresses or route geometry. The browser now keeps a local current-trip snapshot to recover after refresh; transient autocomplete suggestions are excluded. Review local provider-data retention before public deployment.

Each upstream server attempt consumes the existing `PROVIDER_DAILY_LIMIT` allowance, including failed attempts. Selecting a destination normally uses details + reverse lookup + timezone; an ordinary searched place uses details + reverse lookup; GPS/pin uses reverse lookup; a generated driving route uses one Routes attempt. The normal default is 100 attempts per UTC day, with configuration capped at 1000; zero disables attempts. Autocomplete and lookup routes also have request limits. The allowance is per process and resets on restart, not a cloud billing cap. Configure Google quotas and budget alerts separately; do not restart to evade limits. The map instance is reused when markers/routes change to avoid recreating it on each edit.

## Privacy, ownership and saving

All provider requests go through authenticated same-origin endpoints. Query text and coordinates use request bodies in the app API, not application URL parameters. Server logging excludes request bodies/raw provider URLs; errors are sanitized. No continuous location watcher exists. Google/OS services have their own data handling under their policies.

Selected data is validated and registered in a server-memory, owner-bound receipt for 30 minutes. Route requests reference receipts, not caller-supplied addresses or place coordinates. Unknown, foreign or expired receipts fail before routing. Duplicate route request keys cannot submit again; responses/geometry are not cached in that guard. Multi-instance sharing of receipts/quotas requires additional release work.

The browser automatically keeps the current trip in `daywise-live-active-v1` local storage: selected locations, generated/accepted schedules, price allowances, preferences and reported costs/progress. It does not store autocomplete suggestions or server secrets. Refresh restores the same local snapshot, without calling GPS or automatically making new provider lookups. Locations must be refreshed explicitly before changing routes; expired route estimates remain marked as historical. Delete local trip removes this snapshot and linked named preferences. Separate Save day preferences still uses the existing ID-only IndexedDB records and provider re-resolution. Shared/downloaded copies are independent. The development privacy notice reflects this behavior; review provider retention and applicable account/regional terms before public release.

Existing fixture-era records remain untouched in `daywise-m1`/legacy backend storage. They are not migrated into real locations, served as suggestions or used in live routes. New records use `daywise-live`. Regression fixtures are available only in the isolated Playwright harness. Production client builds exclude their location modules, and `check:release` scans for known fixture identities and server-key leakage.

## Limits and verification

This change routes user-selected real places. It does not invent admission fees, dietary compliance, accessibility, opening hours or automatic attraction recommendations. A driving route alone cannot establish a complete budget or venue feasibility. Later-leg traffic can change during visits; time at stops is your allowance. Booked/actual reports and manual progress remain separate, version-bound records.

Run `npm run check:release` for domain/provider/API tests, isolated Chromium journeys, build, dependency audit, client-secret scan and fixture-location exclusion. Tests use mock provider responses and synthetic browser coordinates, not your device's position or paid account. Real-account verification remains required after configuring keys; no billing account, live credentials or cloud resources were created by this implementation.

Direct Playwright runs also override Google server/browser credentials to blank values and use zero provider allowances, even when the private local `.env` has real keys. Map SDK unit tests simulate loading, timeout, retry, incomplete responses and authorization callbacks without contacting Google. Real-account checks must be separate and explicitly report which APIs succeeded, the actual browser origin and whether GPS was controlled/simulated or a consented device read. Do not include key values or private credential content in reports.
