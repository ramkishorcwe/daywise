# Daywise hosting

The Vite frontend and Fastify API deploy together on Vercel. `npm run build`
creates `dist/` and bundles the native Node server entry as `api/index.mjs`.
The `/api/*` rewrite preserves the original API URL. Other paths, including
`/shared/<id>`, open the SPA. Local development continues to use ports 5173/3001.

## Production environment

Configure these in Vercel's encrypted production environment, never in Git:

- `API_AUTH_MODE=firebase`, `FIREBASE_PROJECT_ID`, `FIREBASE_ADMIN_CREDENTIALS`
  (the service-account JSON, server only).
- `WEB_ORIGIN`: the exact public HTTPS origin.
- `EVIDENCE_RECEIPT_SECRET`: 32 random bytes encoded as base64url. Keep it stable
  between deploys; rotation invalidates outstanding 30-minute selections.
- `GOOGLE_PLACES_API_KEY`, `GOOGLE_GEOCODING_API_KEY`,
  `GOOGLE_TIME_ZONE_API_KEY`, `GOOGLE_ROUTES_API_KEY`: a dedicated cloud server
  key restricted to those APIs. Ordinary Vercel functions have dynamic egress;
  a home-IP restriction cannot authorize their requests. Keep the local key's
  existing IP restrictions. Use static egress if IP restriction is required.
- `ASSISTANT_MODE=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- `PROVIDER_DAILY_LIMIT=1000`, `AI_DAILY_LIMIT=100`.
- Public client configuration: `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_GOOGLE_MAPS_BROWSER_KEY`. Only the browser Maps key may use a VITE name.

Enable Firebase anonymous authentication and authorize the deployed domain.
Create a standard default Firestore database in production mode. Browser access
must stay denied (`firestore.rules`); the Admin SDK performs owner checks.
Add the public origin with `/*` to the browser key's website restrictions.
The browser key remains restricted to Maps JavaScript API.

## State, allowances and sharing

Serverless replicas cannot rely on in-process location registries. Hosted
selections and guide facts carry AES-GCM encrypted evidence receipts, bound to
the Firebase owner and original expiry. The browser keeps those receipts in
session memory and sends only referenced selections. Tampered, expired or
other-owner evidence is rejected. No replacement coordinates are introduced.

Production provider and AI attempts use Firestore transactions across replicas.
Paid calls are blocked if the counter is exhausted or the database is unavailable.
Routing request hashes prevent duplicate submissions across instances. These
application limits are separate from Google and Gemini provider quotas.

Private accepted itineraries are stored in the owner-checked `daywiseItineraries` Firestore collection. LocalStorage retains IDs only; IndexedDB retains device backups. See [accepted-itineraries.md](accepted-itineraries.md). Firebase anonymous identity persists in IndexedDB on the same profile. A deployed
website and `127.0.0.1` have separate storage; deploying does not migrate or
delete the local trip.

Sharing explicitly publishes an allowlisted snapshot with a random 256-bit link.
Anyone with that link can view it without logging in. Start/return coordinates
and the complete route polyline are omitted unless explicitly included. Ages,
diet, private guide notes, actual expenses and authentication receipts are never
published. Shared pages expire after seven days; the creator can remove the
page from the sharing dialog. They do not update when the private trip changes.
This is a snapshot, so traffic, admission prices and opening times need rechecking.

Enable Firestore TTL for `expiresAt` on `daywiseShares`, `daywiseRequests` and
`daywiseUsage` to remove expired server records automatically. Expiry is also
checked by the API, independently of asynchronous database cleanup.

## Verification

Run `npm test`, `npm run build` and the Playwright release checks before publishing.
Verify production `/api/health`, Firebase sign-in, a real city selection and an
itinerary request. Open a generated `/shared/<id>` link in another browser session
and check prices, endpoint privacy, map rendering and removal. Keys and private
working files are excluded from deployment by `.vercelignore`.
