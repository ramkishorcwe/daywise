# Local operations and release runbook

Current real-location startup: follow `location-setup.md`. Normal UI/API startup now excludes fixture cities and source fallbacks. Earlier M1–M16 UI instructions below describe historical regression tooling; their stored records are preserved. Real-location requests use owner-bound transient receipts, existing quotas/auth and no provider-response disk cache.

M4 local tooling, implemented 11 October 2026. This is a development operating model for one loopback API process. It does not approve a public release, create cloud resources or establish real-world facts.

## Check the running API

```powershell
npm run dev:api
# In another terminal:
npm run ops -- status
npm run ops -- catalog-status
```

Operator diagnostics require a separate credential and a loopback connection with no browser Origin header. A normal travel session cannot access them. In local auth mode the API creates a credential under `.local/operations`; the CLI reads it without printing it. In Firebase mode diagnostics are disabled unless a server-only `OPERATIONS_TOKEN` of at least 32 characters is configured. Never put that credential in a browser, URL, client env variable or shared report. This token grants diagnostics only, not trip access or catalog mutation.

The aggregate report has registered route templates, request/rejection/server-failure/rate-limit counts, latency buckets, current catalog counts, and UTC-day provider/AI attempt allowances. It contains no trip IDs, user IDs, coordinates, messages, raw URLs, request bodies, provider responses or secrets. Counters are in memory and reset on restart. Failed upstream attempts consume allowance. Routes and Places share their allowance; AI has a separate allowance. Zero disables calls. Allowances are per process, not provider billing caps or measured costs; shared limits and actual billing controls remain a release gate.

Diagnostic alerts indicate exhausted/disabled allowances or at least three accumulated server failures on a route. They are pull diagnostics, not push notifications or a hosted alert service. If failures rise, preserve confirmations, inspect only sanitized error categories, and investigate before retrying. Reduce allowances to zero and restart to stop new paid attempts; changes do not cancel calls already submitted upstream. Never repeatedly restart to bypass quotas.

## Stage and review catalog updates

No public or browser catalog-writing endpoint exists. Offline commands rely on the operator's OS access to private files. Protect `catalogs/private`, `.local`, `.tmp`, credential files and backups with user-only OS permissions. Windows file modes alone do not establish an ACL; review inherited permissions for a shared machine. The development server explicitly denies those private directories through its filesystem handler. Do not expose the development server publicly or serve these directories through another static server.

Prepare an independently researched JSON input under `catalogs/private`. It contains exactly:

```json
{
  "catalog": { "schemaVersion": 1, "cities": [] },
  "food": []
}
```

The empty example establishes no city evidence. City/location fields are described in `catalogs/README.md` and `packages/data-adapters/src/catalog.ts`. Food records use `id`, `cityId`, `locationId`, one supported `rule` from the contracts, `status` (`supported`, `unsupported`, `unknown`), `scope: "branch_preparation"`, and nullable `evidence`. Both positive and negative assertions need source evidence; missing, expired or future evidence evaluates to unknown. Source records contain HTTPS `sourceUrl`, checking/expiry timestamps, method and recorded reuse rights. A record is branch- and preparation-specific; a generic vegetarian tag is insufficient for strict Jain rules. Do not store contributor names, phone numbers, raw provider payloads or unlicensed content. Reviewers must check what each source actually supports.

```powershell
npm run ops -- stage --input catalogs/private/proposed.json --revision 0 --operator editor_alias --reason "Reviewed branch sources and recorded reuse rights"
npm run ops -- inspect --proposal PROPOSAL_UUID
npm run ops -- approve --proposal PROPOSAL_UUID --digest REVIEWED_SHA256 --revision 0 --reviewer reviewer_alias
# Or discard the proposal, using the CURRENT active revision:
npm run ops -- reject --proposal PROPOSAL_UUID --digest REVIEWED_SHA256 --revision 0 --reviewer reviewer_alias
```

The stage command reports its UUID, digest, base revision, expiry and structural/freshness problems. Inspect the complete proposed content and source documents before approval. Approval requires a different recorded reviewer alias, matching digest/current base revision, an unexpired proposal, and current evidence for dietary assertions and at least two routing locations in each route-review city. Changed city content requires a changed `catalogVersion`. Proposals expire after 24 hours; expired/stale proposals can be rejected and restaged. At most 100 proposal files and 100 active audit references are retained.

Aliases are attestations: this local CLI does not prove that two independent people reviewed the data. Both source truth and reuse rights require human review. Hosted operator identities, roles, durable audit retention and independent approvals remain future work. No real catalog or dietary assertion has been supplied or approved during implementation.

One writer lock and an atomic state rename protect updates across local CLI processes. Approval replaces the complete active content, so inspect removals as well as additions. Rejection leaves active content untouched. Before a change, preserve the last reviewed state in an OS-protected backup if recovery is needed. Recovery should stage a previously reviewed snapshot with the current revision, renewed evidence and new versions for changed cities; never overwrite state.json during a running writer. The API reads approved state on startup; restart it after approval. Fixture confirmations remain fixture snapshots, and live planning stays disabled.

If a process crashes while holding `writer.lock`, stop maintenance commands and check that no writer remains. Inspect the active state's revision and audit entry, compare it with the proposal digest, and preserve the relevant private files before manually removing that exact lock file. Do not blindly clear locks or retry approvals: the atomic rename may already have committed. A failure deleting an already committed proposal is recoverable by inspecting the new active revision and discarding the obsolete proposal. Never recursively delete the maintenance directory to repair a lock.

`CHECKED_CATALOG_PATH` remains available for M2 import, but startup rejects using it alongside an approved maintenance state. Prefer the reviewed workflow. `MAINTENANCE_DIR` and `LOCAL_DATA_DIR` optionally select explicit private paths; the development server denies default private locations only, so keep overrides outside served directories and protect their OS permissions.

## Deletion and retention

**Data connections** exposes export and deletion for the authenticated user's backend trips. Export fetches the current owned trip and downloads fixture preferences/confirmation/progress/history; no owner credential or provider payload is included. Downloads are separate copies with private preferences. Backend deletion does not delete browser drafts, downloaded files, external providers, cloud auth identities or backups. Browser saved-copy deletion is a separate control.

M6 expense records live only inside browser saved days. **Trip budget → Export this budget** downloads the accepted fixture snapshot plus user-reported category amounts, including records awaiting revision review. Backend trip exports/deletion do not include or erase these browser expenses. Deleting a browser saved copy removes its stored expenses too; an open day remains in memory and can be saved again, as the UI states. Remove individual amounts in Trip budget for the active day. Downloads remain separate private copies; budget-export import and expense cloud sync are not implemented. M8's private-day backup is a separate restorable format.

M7 **Travel copy** exports a separate read-only HTML itinerary. It includes the accepted date, timezone, venue schedule, starting/return labels and fixture provenance. Budget estimates are opt-in for each preview; dietary/accessibility preferences, party ages, coordinates, reported progress/expenses, backend IDs and credentials are excluded. The file contains no scripts, remote assets or navigation links, and a restrictive content policy. Download/print actions are local; the traveler chooses whether to send the file. There is no published share URL, access control after sending, revocation, automatic revision delivery or restore/import from this copy. Deletion cannot recall exported or printed copies.

M8 **Saved plans → Backup & restore** downloads one editable private day, including draft/accepted preferences, expense records and matching reported progress. The JSON is unencrypted and contains sensitive preferences/ages; keep it private. Backend trip IDs, credentials and conversations are excluded. Progress has a null backend connection after restore and cannot attach to another backend owner. M10 permits reviewed local progress/delay updates for current-catalog accepted snapshots without reconnecting that workspace. Restore validates a bounded 1 MiB file and supported city references, previews it, then inserts a new UUID record with IndexedDB `add`, never `put`. A collision/storage failure leaves existing days unchanged. No upload, account sync or new feasibility/fact check occurs. Travel-copy, budget and backend exports cannot be imported through this flow. Restoring preserves accepted times/costs as unverified saved fixtures, not authenticated evidence. Local/downloaded copies remain independent of backend deletion and backup retention is controlled by the user.

M9 **Food options** reads only the selected browser draft and software fixture catalog. Its disposable worker checks replacement schedules without an API call; no food comparison or evidence is persisted separately. Applying a replacement uses the ordinary draft planner and confirmation review. Reported progress locks direct replacements, and stale captured contexts cannot overwrite a changed day. Fixtures include no verified preparation/source/checking date; unknown dietary evidence remains unknown and cannot satisfy a selected rule. Real food/accessibility sourcing and future restrictions need independent validation.

Successful backend deletion clears that trip's pending candidates/proposals and clears cached private mutation results for the same owner. Metadata tombstones prevent an old request key from replaying erased data; retries can return `410 REQUEST_RESULT_REMOVED` and require a fresh read. Other stored trips remain available. Safe deletion receipts can still replay. Active in-flight results are checked before sending after erasure. Previously downloaded/received data cannot be recalled.

Private idempotency results expire after 24 hours, candidate/proposal snapshots after ten minutes, and metadata-only route request guards after 24 hours. A one-minute cleanup sweep releases expired entries even when no new requests arrive. Persistent trips are retained until explicit deletion; there is no automatic account cleanup. Local development identity expires after 24 hours and old trips are not reassigned, so delete unwanted trips while that identity is available. A reviewed orphan/account-retention policy, cloud deletion and backup expiry need connected validation before release.

## Run all local release checks

```powershell
npm run check:release
# Explicitly require public/live readiness (currently always returns nonzero):
npm run check:release -- --require-live
```

The command checks unit/API/provider tests, TypeScript/build, browser journeys, the dependency audit and a client credential scan. It records an input-source digest and rejects source changes during a run. Browser servers use ports 5174/3002, fresh private `.tmp` storage, local auth/interpretation and zero paid-call allowances. They never reuse the open preview servers or its trip file. Occupied check ports cause failure rather than reuse of unknown code. No deployment command runs. Install Playwright Chromium before running.

`artifacts/release/report.json` distinguishes **localChecksPassed** from **publicReleaseReady**, which remains false. A normal successful local check exits 0; `--require-live` exits 2 while external gates are pending; failed local checks exit 1. Reports are point-in-time evidence, not signed attestations. The credential scan combines configured secret-value detection with a small set of key markers; it cannot prove the absence of all secrets. No matched secret value is printed. An unavailable audit service fails the check rather than being treated as zero vulnerabilities.

The supplied GitHub Actions workflow runs these local checks without paid credentials and retains its synthetic reports for seven days. It has not run on a connected repository. Local evidence is not evidence of cloud authorization or actual provider behavior.

The isolated browser API harness uses 300 requests and 30 development sessions per minute because many independent guest contexts share one loopback IP. Normal API startup retains 90 requests and 10 development sessions per minute, and API tests exercise rejection at both default and fixture limits. The session override is capped at 30 and rejected outside development CI/local fixture mode or with live adapters or nonzero paid-call allowances. The harness requires a fresh release-check storage path under `.tmp`; it supplies no live provider/cloud adapters and keeps paid-call allowances at zero. Ordinary `npm run test:e2e` also starts the isolated harness and never reuses the normal local API.

## Controlled trial preparation

Before any traveler relies on the app, close the pending gates in the report: independent venue/food/accessibility evidence; provider access/reuse rights and representative routes; durable shared limits/proposals; cloud authorization, deletion and recovery; evaluated AI account/model behavior and actual costs; official notice/source checks; and deployment review. Approving a route catalog or adding keys closes none of these gates automatically.

After those checks and concrete release authorization, recruit a small consented group across different party sizes, diets, mobility needs and city conditions. State estimate uncertainty and notification preferences, provide a manual fallback, record mismatches and accepted/rejected revisions, and measure time to a feasible plan, missed deadlines, constraint failures, usability, support burden and cost per completed plan. Any unexplained hard-constraint failure or unsupported dietary/live claim stops the trial until investigated. Keep trial data minimal and private, agree retention/deletion with participants, and use human-checked reference routes and venue facts. No participant contact, real-user trial or deployment occurred in M4 local implementation.

M10 **Follow my day → Local day updates** records progress and previews delay recovery in a disposable local worker. It never calls an API or infers traffic/event causes. Connected backend workspaces are refused. Acceptance checks the current confirmation/progress/catalog and recomputes the proposal, preserving completed stops and retaining expense records for version review. An IndexedDB transaction compares the captured saved day before writing; changed/deleted records or write failure preserve existing data. Save/reopen before retrying a mismatch. This is local persistence with guarded updates, not collaborative or cloud synchronization. See milestone-10.md.

M11 adds explicit skip/pace choices to this local panel. Only an optional remaining visit can become an accepted exclusion; completed stops, must-visits, meals and rest are protected. Pace affects remaining visit/meal/rest allowances, not past reports or driving speed. A strict action contract grants no arbitrary preference edits or authority for closure claims. Acceptance compares the complete recomputed proposal/input/action against the source, and changed controls clear older previews. No local proposal is stored separately or sent to an external service. See `milestone-11.md`.

M12 adds a reviewed local replacement of a pending, non-required meal. The selected food ID is fixed in both retained-order and fallback calculation; another meal cannot silently satisfy the request. Strict evidence, hours, costs, routes, walking and group constraints are still checked. Completed/required meals are refused. Acceptance retains reported progress and old expense versions, and saves only a fresh accepted itinerary through the existing guarded transaction. No menu, preparation or live availability evidence has been established. See `milestone-12.md`.

M13 stores an optional local return report only after the full itinerary prefix has been reported complete. Arrival/report timestamps are device/manual values labeled unverified, bound to the accepted version and local progress. Arrival cannot precede the last departure or be in the future when entered; DST ambiguity is refused. Corrections replace only that browser metadata, leaving snapshot/progress/expenses unchanged. Completed days cannot be replanned or attached by a late backend callback. Reports use the guarded local transaction, are retained in private-day backups and excluded from read-only travel copies/budget exports. Deletion and downloaded copies remain independent. No remote trip is completed or GPS verification claimed. See `milestone-13.md`.

M14 **Saved plans → Reuse day** creates a new browser draft from an explicitly chosen accepted/draft preference snapshot and optional saved order. It transfers no confirmation, progress, arrival report, expense or backend identity. The new record uses insert-only storage and creation leaves the active/source days untouched. Supported city references and new local dates/windows are checked; source venue facts and estimated schedules are not copied. Creation is local with no API call; opening uses the existing current-catalog planner mode and requires new confirmation. Personal preferences/ages are duplicated privately and each record/download remains an independent copy. See `milestone-14.md`.

M15 **Saved plans** adds temporary name/city/date search, city/reported-status filters and travel-date/recent-save sorting. Finder controls only project the loaded collection; no query is stored, transmitted or placed in a URL. Calendar dates come from destination-local draft preferences. Progress/return status requires explicit stored reports, never clock inference. Refresh retains previously loaded cards on save/read failure and reports the failure rather than an empty collection. Existing explicit record actions and independent-copy retention remain unchanged. See `milestone-15.md`.

M16 adds a one-shot browser location preview only after **Use my current location**, and in-memory address entry/local demo-point search. Coordinates/accuracy/timestamps and typed addresses never enter saved trip contracts, exports or backend calls. No watcher or background read runs. Late callbacks are ignored after mode/city changes or closing. Real current/address sources block building a fixture plan until the user explicitly chooses a test start; no nearest-demo substitution is made. Real source routing still requires connected providers, checked city data and live-planner integration. Browser/OS permission and location-service behavior remain outside application storage. See `milestone-16.md`.


Real-location implementation adds authenticated `/api/locations/autocomplete`, `/resolve`, `/reverse` and `/api/plans/live`. Normal API startup permanently sets fixtures false; production rejects fixture adapters. GPS and pin lookup preserve exact browser/clicked coordinates. Lookup consumes allowance once per upstream operation, and route input resolves owner-bound, 30-minute memory receipts. Client production builds are additionally checked for known fixture location identities and geocoding/timezone credential leakage. Saved references/preferences/reported amounts/progress are private browser-owned data; Google addresses/routes are not persisted. Details, account setup and remaining live validation are in `location-setup.md` and `milestone-17.md`.
