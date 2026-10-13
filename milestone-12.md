# Milestone 12 — reviewed remaining-meal recovery

12 October 2026. Extends **Follow my day → Local day updates → Choose what to review** with **Replace the remaining meal**. Works locally for both supported city fixtures without an API, account or paid provider.

## Try it

Confirm/save a day and record local progress before the meal is complete. Choose **Replace the remaining meal** and inspect the alternative. The panel shows the original and chosen meal, whole-group price range, fixture opening/last-entry hours, step-free evidence and statuses for every selected strict dietary rule. It identifies the catalog and clearly states that real checking dates, preparation, availability and dietary compliance are unverified.

**Preview local revision** checks the selected meal against the existing report, completed prefix, required visits, food/mobility/family requirements, hours, travel, walking, return deadline and whole-group upper budget including reserve. The existing remaining order is checked first, then alternatives are evaluated if needed. The chosen meal stays fixed in that request: fallback cannot silently choose a cheaper or compatible meal instead. If it cannot fit, no proposal can be accepted and the current confirmation/report remain intact. Optional visits can change in a feasible fallback; inspect all removals/additions in the preview.

**Keep accepted schedule** discards the proposal, preserving recorded progress and the existing meal. **Accept local revision** recomputes and verifies the complete proposal before saving a fresh confirmation. Completed stop data and reported departure stay unchanged. The new meal survives reload and private backup; old expense records keep their original version IDs and require the usual review.

## Protected constraints and boundaries

Only a known different food place in the confirmed city can be selected. A completed meal, a required original meal, an unknown/foreign/non-food target or a day with no pending meal cannot be replaced. Unknown dietary evidence never satisfies a strict rule; exclusions, family needs and required accessibility remain enforced. Missing prices/hours/routes or an over-budget/late choice cannot be presented as feasible.

A replacement does not remove the meal requirement, change dietary rules, raise the budget, alter the group or create permanent exclusions/must-visits. The meal choice belongs to the reviewed proposal, not a permanent new preference. A later recovery may offer a different change through a separate preview/acceptance. Prices use the same per-person range for adults and children, as the fixture model states; booked/actual amounts do not alter planner feasibility.

Direct food/timeline edits remain locked after progress. Use this local review flow for local/offline days; backend-linked days retain their existing assistant route and cannot be silently detached. Current-catalog, unaccepted-draft, stale-source, transaction/storage and cancellation guards from M10/M11 remain in force. Changing a control clears an old preview, and recording that the meal is complete disables replacement.

The strict local change contract adds one meal target. The scheduler's internal forced-meal context applies only to that calculation and grants no arbitrary input changes. No browser storage migration, new dependency, GPS read, live restaurant/source claim, AI call, cloud write or deployment is introduced. This is a software-fixture workflow, not restaurant verification or booking.

## Verification

The suite contains 127 unit/domain/API/provider checks and 41 Chromium journeys. New domain checks cover exact selected-meal retention, unchanged preferences/completed stops/progress, acceptance and backup, protected/foreign/non-food targets, unknown dietary evidence, selected-meal cost/hour/route/exclusion failures, USD scope and tampered/stale actions. Browser journeys cover preview/decline/accept/reload without API calls, strict unknown evidence, phone/USD evidence and completed-meal protection.

Run `npm run check:release` for point-in-time evidence in `artifacts/release/report.json`. Live release gates remain open in `operations.md`.
