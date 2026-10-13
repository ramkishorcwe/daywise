# Milestone 11 — reviewed remaining-day choices

12 October 2026. Extends **Follow my day → Local day updates** with skipping an optional remaining visit and changing the remaining pace. Uses the same city-independent fixture engine; no backend, account or paid provider is needed.

## Try it

Confirm/save a day, then record local progress in **Local day updates**. Under **Choose what to review**, select **Use saved lateness only**, **Skip an optional visit**, or **Change remaining pace**. Preview uses the saved completed prefix and departure report; record changed progress/lateness fields before previewing.

Skip selection contains only optional visits still ahead of that saved prefix. Completed stops, required visits, meals and rest are never skip targets. The chosen visit is added to the proposed exclusions and remains excluded after acceptance, including reload/backup. Skipping is a traveler choice, not evidence of a venue closure, road disruption or festival.

A new pace changes remaining visit/meal durations and an upcoming rest allowance. Completed stops, including their original timestamps, durations and costs, remain byte-for-byte unchanged. A pending rest uses 20 minutes for relaxed pace or 15 for balanced/packed; an already completed rest is never resized. Pace does not change driving speed or claim a faster street route. No pace change is offered when all stops are complete; use saved lateness to review return travel.

The existing recovery planner first checks the retained remaining order and then evaluates alternatives if needed. The preview shows all removals/additions, return/cost changes and retained completed stops. Required visits, selected strict food/mobility rules, party, currency, budget, reserve and endpoint/deadline remain checked. If no evaluated plan fits, the accepted version and saved report stay intact. Optional remaining stops may change in fallback proposals; review the complete list before acceptance.

**Keep accepted schedule** discards only the proposal, preserving the progress report. **Accept local revision** creates a new confirmation and saves its changed pace/exclusions only after rechecking the current source. Old expense records remain attached to their original version and need the usual review. Altering the revision choice, target, pace or progress form clears an older preview so it cannot be mistaken for the new request.

## Boundaries and validation

The change contract is a strict discriminated union allowing only delay review, one named skip, or one supported pace. Extra fields, arbitrary preference patches, unsupported actions and unknown pace values are rejected. Acceptance recomputes the request and compares the entire derived proposal, including its input and change description, before saving. A modified budget, diet, target/action, plan, progress, confirmation or catalog cannot be accepted through a stale/tampered proposal.

M10's current-catalog, unaccepted-draft and backend-workspace guards still apply. Local storage uses the existing compare-and-write transaction; failures or changed/deleted saved records are not overwritten. The calculation stays in the bounded cancellable worker with loading/error/timeout states. No schema migration, new dependency, location read, live-source claim, AI call, cloud write or deployment is introduced. Direct timeline/meal edits after progress remain protected. This milestone adds explicit skip/pace choices to local updates, not unrestricted preference editing.

M12 adds a separately reviewed replacement of an optional pending meal. Completed/required meals and the meal requirement stay protected; see `milestone-12.md`.

## Verification

The suite contains 123 unit/domain/API/provider checks and 38 Chromium journeys. New domain coverage checks selected-stop exclusion and backup persistence, preserved requirements/progress, protected/foreign/unknown targets, pace effects on remaining rest and completed-prefix retention, all-complete behavior, strict action validation and tampered proposal rejection. Browser journeys cover decline/accept/reload with no API calls, preview invalidation when pace changes and phone/USD/all-complete behavior. Existing backend and local recovery checks remain part of the release run.

Run `npm run check:release` for point-in-time evidence in `artifacts/release/report.json`. Real venue/provider/cloud checks and controlled traveler trials remain gated in `operations.md`.
