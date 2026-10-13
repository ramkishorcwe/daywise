# Milestone 10 — local day progress and delay revisions

12 October 2026. Adds **Follow my day → Local day updates**, so a confirmed fixture day can be followed and revised without a backend account, local API or provider request. The feature uses the same deterministic rules for both city fixtures.

## Try it

Confirm and save a day, then open **Follow my day → Local day updates**. Choose the completed prefix and total lateness at that point, from zero to 180 whole minutes. **Record local progress** saves the report while preserving the accepted schedule. Lateness is measured against departure at the selected point in the current accepted schedule; it is not added again on every preview. Reports cannot remove completed stops or move the reported departure backwards. All stops completed still leaves the return journey unreported.

**Preview local revision** uses the saved report, not unsaved form edits. It first checks the existing remaining order, then evaluates alternatives if that order no longer fits. The preview lists removed/added stops, return and upper cost changes, all remaining times and retained completed stops. Food/mobility requirements, required visits, group budget including reserve, hours, meals/rest and the return deadline stay checked. Optional remaining visits can be removed to recover the day; no live detour or cause of a delay is invented.

**Keep accepted schedule** discards only the preview. The factual progress report remains saved and old remaining times may be outdated. **Accept local revision** verifies the source confirmation, exact progress and catalog again and recomputes the proposal before creating a new confirmation. The completed prefix stays byte-for-byte unchanged. Expense records are preserved with their original version IDs and enter the normal review state after a new confirmation. Reload reads the accepted snapshot and report rather than regenerating them.

## Ownership, recovery and failures

Local reports have no backend connection. A day already linked to a backend workspace keeps its existing assistant route; local updates refuse that workspace and cannot silently detach or diverge from it. Start a separate day to change modes. M10 also permits a valid restored offline backup to continue through local updates, without reconnecting its excluded workspace. This extends M8's original read-only offline behavior. Direct timeline/food edits remain locked after progress; local updates cover reported progress and delay recovery, not unrestricted preference editing.

M11 extends this panel with explicitly selected skips of optional remaining visits and remaining-pace changes, using the same review and persistence safeguards. See `milestone-11.md`; it does not permit removing completed stops, meals/rest or required visits.

Unaccepted draft changes must be reviewed or discarded before local reporting. A stale/unsupported catalog, missing confirmation or backwards/invalid report has an explicit error. An infeasible remaining day preserves the confirmation and saved report. The bounded solver does not prove every possible real-world trip impossible.

The panel and calculation worker load on demand. Loading, timeout and worker errors allow retry; closing terminates the worker. Updates save before changing the active view. A single IndexedDB read/write transaction compares the saved day with the captured source, ignoring only its save timestamp. Changed or deleted records and storage failures reject the update rather than overwriting or recreating them. Save/reopen the current day before retrying a mismatch. The active-view context is checked around the write, so a separate active day cannot be replaced by a late result. Ordinary browser autosaving remains the existing local persistence mechanism; this does not introduce general collaborative editing or cross-device sync.

No storage/schema migration, new dependency, GPS permission, paid provider, AI call, cloud resource or deployment is introduced. Current software fixtures are not real travel facts. Local progress and new accepted snapshots are included in the existing private backup format. Exported copies remain independent and retain the version exported at that time.

## Verification

The suite contains 119 unit/domain/API/provider checks and 35 Chromium journeys. New checks cover monotone progress and departure, valid bounds, exact completed-prefix retention, repeated previews without compounding delay, stale/tampered proposals, infeasible returns, connected/old/unaccepted contexts, expense-version review and USD restored-backup continuation. Browser journeys cover report/decline/accept/reload with no API requests, simulated storage exhaustion and changed records, phone/USD/no-fit behavior and backend-workspace separation.

Run `npm run check:release` for point-in-time results in `artifacts/release/report.json`. Live source/provider/cloud validation and controlled traveler trials remain open in `operations.md`.
