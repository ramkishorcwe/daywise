# Milestone 9 — food evidence and meal comparison

11 October 2026. Adds **Food options** to the navigation, using the same city-scoped rules for Jaipur and synthetic Harbor City. No restaurant research, account setup, live availability or external service has been supplied or inferred.

## Try it

Build a draft and open **Food options**. The panel captures that draft's preferences and itinerary. Each food card shows all six supported dietary rules, marks selected strict rules, distinguishes fixture support, conflict and unknown evidence, and gives opening/last-entry hours, step-free evidence and the whole-group meal price range. It identifies the fixture catalog and explicitly states that real checking dates and preparation verification are unavailable. No dietary or accessibility guarantee is made.

For a current feasible draft with one meal, the comparison replaces only that meal at its existing position. It uses the deterministic scheduler to check visits, required/excluded stops, dietary evidence, family/mobility constraints, opening and lunch times, travel, return, walking limit and the full group upper budget including reserve. It keeps every other place in order rather than dropping visits or relaxing rules to make a food option appear suitable. Unknown meal hours, prices or routes prevent a feasible comparison. Costs use the same per-person range for adults and children, as the fixture model states; booked/actual records are separate from planner feasibility.

Cards show the candidate meal time, return time, walking and upper whole-day estimate, plus changes relative to the captured draft. **Use … in draft** sends the checked order through the normal draft planner. A confirmed day stays independent; review and acceptance are still required in the planner. Keeping the confirmation discards the replacement. Existing expense records stay attached to their original confirmed version and require the normal review after a new confirmation.

## Failure handling and boundaries

All options remain visible when no meal meets strict rules, so the traveler can see which evidence is missing without having requirements changed automatically. Unsupported, excluded, required-original-meal, unavailable, stale-catalog and infeasible replacements cannot be applied. If there is no current feasible draft with one meal, the panel shows evidence and explains that a draft must be built first; it does not invent an itinerary or insert a meal into an evening-only day. No food catalog produces an explicit empty state.

Reported progress locks direct meal changes, including restored offline progress. Use assistant proposals for connected progress or start a separate day for detached snapshots. The parent verifies the captured session, preferences, plan and progress again before applying an order, protecting against stale asynchronous comparisons. Closing the panel cancels its worker. Loading, timeout, worker failure and retry preserve the current day. Comparison runs in an on-demand worker and the panel is lazy-loaded, avoiding scheduler work on the UI thread.

No schema/storage migration, new dependency, GPS read, cloud call, AI call, restaurant booking, upload or deployment is introduced. Food comparison itself makes no API request. Applying a draft uses the existing local worker or connected fixture backend, as already selected. Real menu/preparation evidence, custom dietary restrictions, allergy handling, authoritative accessibility information and live restaurant availability remain future data and product work.

## Verification

The suite contains 112 unit/domain/API/provider checks and 31 Chromium journeys. New domain checks cover unchanged visits/baselines, unknown/negative food evidence, required and excluded meals, schedule/cost/route/walking failures, USD party prices and per-person budgets, stale/foreign/inconsistent plans, empty coverage and child/mobility requirements. Browser journeys cover review/decline/accept/reload, unsupported strict rules, mobile USD comparison, worker failure/retry with no API requests and progress protection.

Run `npm run check:release` for point-in-time evidence in `artifacts/release/report.json`. Live release gates remain open in `operations.md`; passing fixture checks does not verify real food claims or a travel day.
