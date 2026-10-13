# Milestone 14 — reuse saved days as separate drafts

12 October 2026. Adds **Saved plans → Reuse day** to start another date from a saved day's preferences without transferring old trip facts. Both city fixtures use the same flow.

## Try it

Open **Saved plans** and choose **Reuse day** on a card. The panel captures that saved record, names its city/currency/timezone and lets you choose **Accepted day preferences** or **Current draft preferences**. Draft-only records can use their draft preferences. Enter a new day name/date and review or adjust the start/return window. The new date starts blank so it is an explicit choice.

The summary identifies the selected party, budget basis, reserve, food/mobility rules and pace. Party ages, interests, manual anchors, must-visits, exclusions and hidden-gem preferences are copied from that chosen input. The source's accepted and unaccepted preferences are not silently combined. Switching preference basis restores its saved time window; you can adjust that window for the new date.

Optionally keep the chosen source's saved stop order. An accepted day has its accepted order; a draft has only its explicitly saved draft order. When no order is stored, opening selects stops afresh. Turning off order reuse selects fresh stops rather than copying venue recommendations or timing from an old snapshot.

**Create saved draft** inserts a new UUID record. The source and active day stay unchanged; close the panel and open the new card to calculate and review it. Opening runs the usual current-catalog worker/fixture backend planner for that new date/window, so copied order/preferences can fail hours, food, walking, budget or return constraints. No plan is confirmed until normal review/acceptance. This is reuse of a one-day starting point, not multi-day planning or a guarantee that the same stops fit.

## Facts, privacy and failures

The new draft deliberately has no confirmation, accepted timestamps/plan, completed stops, return report, expenses or backend workspace. This applies to completed, progressed and connected source days. Past booked/actual amounts are not spending or bookings for another date. All carried personal preferences stay private on this device; no account, upload or paid call occurs during creation. Opening uses the currently selected planner mode as before.

Names, new date/window and request fields are validated. Currency, anchors, required/excluded places and the copied order must belong to the supported current city. Ambiguous/nonexistent local times are rejected. A retired/duplicate order can be discarded by turning off order reuse, but retired hard preferences are not silently removed. The source is preserved and a fresh day must be reviewed when those choices are no longer supported.

The panel reports saving failures and allows retry. A separate IndexedDB insert cannot overwrite an existing ID, and no partially created copy is presented as saved. Double activation is guarded and a successful create disables further creation in that panel. Closing during an authorized insert does not alter the active day or reopen the panel. Invalid/unsupported source records remain governed by the existing storage validation; no database migration or new dependency is added. New long names wrap in saved cards on phones.

Private backup restores remain a separate feature: they preserve an editable snapshot and its eligible reports, while reuse intentionally resets those facts for another day. No live venue facts, customer trials or production deployment are established here.

## Verification

The suite contains 137 unit/domain/API/provider checks and 48 Chromium journeys. New domain checks cover completed-day reset and independence, accepted/draft USD selection, retired orders/hard references, names/dates/windows/DST and fresh calculation of infeasible copied choices. Browser journeys cover creation/opening with unconfirmed fresh scheduling, expense/report exclusion and source preservation, draft-only USD/long-name phone layout, invalid windows and failed inserts.

Run `npm run check:release` for point-in-time evidence in `artifacts/release/report.json`. Live release gates remain open in `operations.md`.
