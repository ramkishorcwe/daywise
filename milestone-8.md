# Milestone 8 — private editable day backup and restore

11 October 2026. Adds local recovery and portability for the saved-day journey without Firebase accounts, cloud synchronization or provider calls. The same format supports the Jaipur and synthetic Harbor City fixtures; the product remains city-independent.

## Try it

Open **Saved plans → Backup & restore**. **Download private backup** captures the currently selected day as it was when the panel opened, including preferences still in memory, draft order, the accepted snapshot and booked/actual records. The panel names the selected city/date so it is clear which day is being copied. It supports unconfirmed drafts as well as confirmed days.

Choose a Daywise private-day JSON file to preview its city/date/currency, party size, accepted stop count, expenses and completed-stop report. Nothing is saved during preview. **Restore as separate day** inserts a new record with a fresh day ID and `(restored)` title, then leaves your active day unchanged. Close the panel and open the copy in Saved plans. Existing days are never overwritten, even if the restored file came from the same day or an ID collision occurs. The normal reload behavior opens the most recently updated saved day, which may be the newly restored copy.

This is a different format from the read-only travel copy, budget export and backend trip export. Those files do not contain the complete editable browser day and cannot be restored here. A private-day backup contains sensitive dietary/accessibility preferences, ages and expense amounts; it is unencrypted and should be kept private. It is not a public sharing feature, account synchronization or a backup of all saved days at once. No upload or automatic sending occurs.

## Accepted versions, progress and privacy

Draft preferences/order remain separate from the accepted snapshot. Restoring accepted delay revisions preserves their exact timestamps and projected costs; it does not regenerate a day or accept a new proposal. Matching expense version IDs are retained, including old category records that still need review. The expense projection does not double-count imported amounts.

Backend workspace trip IDs, credentials and assistant conversation are excluded. If no progress was reported, the workspace reference is dropped. Reported progress is retained with a null backend connection, its matching accepted version and valid completed prefix. Follow my day displays it on this device. Reopening the assistant reports the detached state without making a reconnection request. A restored day with progress stays protected from direct timeline edits and backend assistant revisions; start a separate day to use a fresh backend baseline. M10 adds reviewed local progress/delay updates for supported current-catalog snapshots without reconnecting the excluded workspace; see `milestone-10.md`. Backup/restore itself does not silently transfer ownership or reset completed stops.

Only the browser day is restored. Backend trips, cloud accounts, pending proposals, cached API results, provider payloads and authoritative source evidence are not restored. The format is unsigned, so validation establishes structural consistency rather than authenticity or current real-world truth. Imported venues/hours/costs remain saved software fixtures. Older catalog versions are labeled and accepted only while referenced city anchors/places remain supported; unsupported references are rejected rather than invented or silently replaced.

## Validation and failures

Files are limited to 1 MiB before reading and again before parsing. The versioned envelope and session reject unknown fields and unsupported versions; IDs/timestamps, money, currency/city scope, order, timezone/date, accepted budget, linked travel/return sequence and detached progress are checked. JSON contents are treated as data, never HTML or instructions. File extension/MIME type alone is not trusted. Invalid files clear the previous preview and cannot add a record.

Restore uses an IndexedDB insert, so an existing ID cannot be overwritten. A storage failure retains the valid preview for retry and preserves active/existing days. Late file-read responses cannot update a closed panel. Successful downloads, restored records and backend records remain separate copies: deleting one cannot recall another. Device storage may still be cleared or unavailable; keep a private file if recovery is needed.

The backup/restore module is loaded on demand. No new package dependency, production deployment, account or paid call is introduced.

## Checks and remaining gates

The suite now contains 105 unit/domain/API/provider checks and 27 Chromium journeys. New checks cover draft/accepted/expense round trips, accepted delays and offline progress, credentials/workspace exclusion, unsupported and oversized files, city/currency/sequence validation, independent USD drafts, preview-before-save, separate records, persistence/deletion isolation, forced ID collision and storage exhaustion. The isolated browser harness permits 30 development sessions per minute for independent test identities sharing loopback; normal startup retains its 10-session limit, and API checks enforce both limits and reject unsafe overrides. Run `npm run check:release` for point-in-time results in `artifacts/release/report.json`.

Live city facts, licensed navigation, cloud/provider/AI authorization, durable production controls and controlled traveler trials remain gated in `operations.md`. Restoring a software fixture is not validation of a real trip or completion of those gates.
