# Milestone 5 — follow a day and preserve accepted schedules

11 October 2026. This focused local follow-up completes the usable day-view portion of the MVP journey and fixes accepted-schedule recovery. It is an extension of the four original local milestones, not an announcement that external release gates are complete.

## Try it

Confirm a plan, then select **Follow my day**. The view shows the next planned visit, meal or rest break, the selected/last reported anchor, accepted arrival/departure times, cost/travel estimates, reported completed stops and the remaining return journey. It works on a phone, including a 320-pixel viewport, and retains the fixture/city/timezone labels.

**Report progress or a delay** opens the existing assistant. If needed, explicitly choose **Use my confirmed plan** to create the private server baseline, then record completed stops or review a delay proposal. This action continues to require the local API. **View itinerary** returns to the timeline. **Plan another day** saves the current browser session before creating a separate draft; a saving failure preserves the current day and reports the problem.

There is no GPS, continuous tracking, clock-based completion, actual-spending collection, external navigation to fictional places or inferred live disruption. Marking every stop complete leaves the return journey outstanding; the app does not assume the traveler has arrived at the endpoint.

## Recovery fix

Previously, reopening a saved session recalculated the whole day from its original start. An accepted delay revision could therefore display new draft times that differed from the retained confirmation, despite the traveler making no new edit. Switching from a progressed day to a saved day also passed through the current day's edit guard.

Reopening now reads the exact accepted snapshot when preferences/order are unchanged or the session has matching reported progress. Completed timestamps, revised remaining times and costs stay unchanged. Unaccepted drafts still calculate separately; the day view always uses the accepted version. Opening a saved day is separate from editing the current day. A catalog-version mismatch is visible in the day view, and restoration does not claim a new feasibility or freshness check.

Backend reconnection compares its confirmed input/plan with the browser's accepted baseline before enabling assistant actions. A changed or unavailable backend preserves the browser snapshot and reports the mismatch instead of silently replacing it. Reconnecting may refresh reported progress when the confirmation still matches; it cannot accept a different itinerary. Late callbacks from a closed assistant cannot attach the old workspace or confirmation to a different active day.

## Checks and remaining gates

The suite now contains 85 unit/domain/API/provider checks and 16 Chromium journeys. New journeys cover exact timeline/cost preservation after a delay revision and reload, unavailable backend recovery, a separate day from a phone, opening the previously progressed day, pending drafts, the remaining return and a conflicting backend confirmation. Run `npm run check:release` for point-in-time results in `artifacts/release/report.json`.

Live provider/AI checks, verified venue/food facts, navigation handoff, durable production controls, cloud authorization and controlled traveler trials remain gated as documented in `operations.md`. Reading a saved fixture snapshot does not prove current real-world conditions or offline maps. No real accounts, paid calls, participant contacts or deployment are added in this milestone.
