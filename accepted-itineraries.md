# Multiple private itineraries

Press **New itinerary** to start a blank draft without removing earlier accepted trips. Generate/review normally, then accept the itinerary to save it. Plan previews and form edits do not save. Reaccepting the identical reviewed plan updates its existing ID; accepting a newly generated plan creates another entry. **Saved plans** opens, lists and deletes individual accepted trips. Up to 100 active itineraries are supported per backend owner.

## Storage and retrieval

- LocalStorage key `daywise-live-active-v1` now contains version 2 references: `acceptedId`, `ids` and `pendingIds`. These are UUIDs only, plus the schema version. No itinerary, address, route geometry, guide notes or price payload is written there by the new save flow.
- Production saves accepted snapshots to Firestore `daywiseItineraries` through authenticated server endpoints. Local development uses an atomic server file, `.local/accepted-itineraries.json`, under the existing `LOCAL_DATA_DIR` when configured.
- `PUT /api/itineraries/:id` saves an accepted trip; `GET /api/itineraries` lists the current owner's IDs; `GET /api/itineraries/:id` retrieves a snapshot; `DELETE /api/itineraries/:id` removes its content. An ID is not a public sharing link. Every operation validates the signed-in owner; other owners receive 404.
- The existing IndexedDB accepted-trip library remains a device backup. Opening a synced trip fetches its database record by ID and updates that backup. If the connection fails, an existing backup remains readable. A first fetch without a backup needs the backend.
- Failed database saves show an error and a retry action. Their IDs remain pending and the accepted device backup is retained. They are not described as successfully saved to the database. Progress and explicit price allowances update the accepted copy, not unrelated draft edits.
- Firebase anonymous identity now persists in IndexedDB across browser restarts. This preserves access on the same browser profile; there is no new cross-device account login. Clearing authentication/browser data may lose access to that anonymous identity, even if an itinerary ID is known.

## Compatibility and deletion

Legacy full localStorage snapshots are validated and backed up in IndexedDB before the local record is replaced with ID references. Previously accepted device records can be uploaded when opening Saved plans; unsupported records are preserved. Optional legacy `destinationMode` metadata remains readable. No unaccepted draft is migrated into the accepted library.

Deleting one itinerary removes its database content, device backup and local reference, leaving other itineraries intact. Database deletion must succeed before the backup is removed. A failed deletion restores references and offers retry. Server ID-only tombstones prevent delayed saves from recreating deleted content. Already published shared pages/downloads are independent copies, as explained in the deletion dialog.

Accepted provider snapshots remain historical estimates. Opening them never reruns planning, GPS, Gemini or paid Google lookups. Expired traffic/location evidence stays labeled; refresh locations and regenerate explicitly before relying on updated travel estimates. Sharing, meals, price summaries, preference coverage, comparison and chosen-place routing keep their existing behavior.

## Verification

`tests/accepted-itineraries.test.ts` covers ownership, multiple IDs, receipt exclusion, invalid/draft submissions, stale updates, persistence across local backend restart and deletion tombstones. `tests/e2e/database-itineraries.spec.ts` verifies two accepted itineraries, a blank new draft, ID-only localStorage, fetching after clearing the device backup, independent deletion, database failure and retry. Existing acceptance, offline recovery, GPS, comparison, pricing and sharing tests remain applicable.
