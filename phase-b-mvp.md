**Phase B — MVP definition for the travel planning platform**

Version 1, 9 October 2026. Based on the Phase A desk review and the user's geographic clarification. This document defines proposed product requirements; it does not claim that user research, restaurant verification, or connected-provider tests have been completed.

**Product direction**

A city-independent travel planner that helps travelers build and follow a realistic day plan around their time, group, budget, interests, mobility, and food requirements. India is the initial market. Jaipur supplies the first testing dataset. The product name, user-facing language, planning rules, and data contracts must support expansion to other cities.

The public promise is: “Plan a practical day, understand the estimates, and stay in control when conditions change.” AI helps travelers express preferences and understand choices. Structured application data and deterministic checks determine timing, costs, and eligibility.

For the first release, support one sightseeing day per plan, one party, and driving/car/taxi with walking connectors. A taxi travel-time estimate is not a taxi fare quote. Families with dietary requirements are the first research segment; solo travelers and couples can use the same party model. Hotel bookings, intercity routing, and collaborative editing are deferred.

**7. Smallest useful product**

The MVP must let a traveler select an enabled city, supply a few essential details, receive a practical itinerary, edit it, save it, and recover from a delay. It includes meals and rest breaks rather than treating a trip as a list of attractions.

Each stop shows arrival, duration, departure, group cost estimate, selection reason, relevant restrictions, and its outgoing travel leg. Show distance, mode, travel estimate, and freshness for each leg. The last stop includes return travel to the chosen endpoint. Show estimated admission eligibility and any last-entry cutoff. Missing critical facts remain visible and can prevent a plan from being confirmed as feasible.

The initial catalog is curated. An editor may include lesser-known places, but no public community or ratings system is required. The first interface is a responsive web product, with the complete timeline usable on a phone even if the map fails.

A public release requires real licensed provider integration and checked catalog facts. Early implementation milestones may use explicitly labeled test data. Simulated traffic, prices, venues, or hours must never appear as verified live information.

**Any-city expansion requirements**

| Requirement | MVP decision | Expansion acceptance criterion |
| --- | --- | --- |
| Identity | Generic travel product language; no city name in the product identity | Changing the enabled city changes relevant data and labels without changing the product name |
| City records | Each city has a stable ID, display name, country, geographic bounds, timezone, local currency, and enabled capabilities | A second city's fixture can exercise the same planner and screens |
| Availability | Only cities with sufficient catalog and provider support can generate a supported plan | Unsupported city selection produces a clear coverage message; no invented itinerary |
| Planning | Rules operate on city-scoped place and trip data | No branch such as “if Jaipur” in timing, budget, ranking, or revision rules |
| Time and money | Trip-local timezone; currency code plus money amount; explicit local date | Non-IST and non-INR test fixtures render and calculate correctly without mixing currencies |
| Language | English first; local place names and user food restrictions retained | User-facing strings can be translated later; locale is separate from city identity |
| Data sources | Venue, food, event, routing, and weather coverage described per city | A city can lack advisories or live traffic without disabling its entire planner |
| Local rules | Country/city-specific ticket eligibility, holidays, transport availability, and restrictions carried in data | Adding new local facts does not require rewriting the core itinerary engine |

This is an expansion-capable design, not a claim of universal current coverage. Adding a city is a data and operations release: verify entrances, hours, costs, food evidence, providers, source permissions, and local edge cases before enabling it. Different city sizes and transport patterns may require later scheduling enhancements.

Do not add currency conversion to the first release. Use the destination's currency for its budget and ask users to enter that amount. Future conversion must preserve source currency, rate source, and rate time. INR is an initial dataset value, not a hardcoded global unit.

**8. Feature priorities**

| Priority | Feature | Minimum release behavior |
| --- | --- | --- |
| Must Have | City selection and coverage | Show enabled cities, coverage limitations, and manual start/end points |
| Must Have | Progressive preferences | Date, available hours, party, group/per-person budget, transport, strict food needs; follow up for missing relevant constraints |
| Must Have | Structured itinerary | Arrival/departure, visits, meals, breaks, legs, endpoint, explanations, and factual provenance |
| Must Have | Feasibility checks | Respect supplied hard requirements; disclose unknowns and impossible combinations |
| Must Have | Map plus timeline | Numbered markers and provider route geometry; timeline remains available when map loading fails |
| Must Have | Food evidence | Restriction-specific evidence, source/checking date, suitable alternatives or explicit no-match state |
| Must Have | Group budget | Estimated ranges by category, known fixed amounts, contingency, and missing amounts |
| Must Have | Edits and revisions | Add/remove/replace/reorder; recalculate a draft; material changes require acceptance |
| Must Have | Delay recovery | Traveler enters lateness or refreshes eligible legs; compare proposal against confirmed version |
| Must Have | Honest assistant | Interpret preferences and explain stored/provider facts; unavailable current data is stated explicitly |
| Must Have | Save and reopen | Guest draft survives a reload in the same browser; confirmed plan remains available with its checking time |
| Must Have | Navigation handoff | Link for the next leg to an external navigation provider, clearly identified |
| Must Have | Data maintenance | Restricted editor can update independently sourced facts and evidence; stale/unreviewed entries are visible |
| Must Have | Failure handling | Loading, missing-data, no-match, timeout, stale-data, invalid-input, and retry states |
| Should Have | Optional one-time GPS | Permission sought at user action; denial retains manual input; no ongoing collection |
| Should Have | Account sync | Opt-in account saving across devices without requiring signup to create a plan |
| Should Have | Curated hidden gems | Optional suggestions ranked by fit, with the same feasibility and evidence checks |
| Should Have | Read-only sharing/export | Private-by-default sharing with deliberate consent and minimal personal information |
| Should Have | Supported advisory notices | Curated authenticated advisories; show location/time uncertainty and link to source |
| Should Have | Forecast-aware alternatives | Forecast label, freshness, limited horizon, optional indoor substitution proposal |
| Should Have | Booked and actual expenses | Separate expense states; do not double-count estimate and actual for the same item |
| Later | More published city datasets | Enable after meeting the same data-readiness requirements |
| Later | Multiple days and intercity trips | Day boundaries, accommodations, and larger scheduling scope |
| Later | Community contributions and reviews | Moderation, duplicate detection, anti-abuse, privacy, and sustainable maintenance |
| Later | Public transport and complex mixed modes | Verified timetables, transfers, walking suitability, and coverage |
| Later | Automated advisory ingestion | Licensed reliable sources, human review where required, geographic resolution, and expiry |
| Later | Background monitoring and notifications | Explicit opt-in, useful change thresholds, consent, and cost controls |
| Later | Bookings and monetization infrastructure | Actual partner access and validated demand |
| Later | Group collaboration | Ownership, invites, conflict resolution, and permissions |

Must Have does not mean every item ships in the first coding milestone. It defines the minimum complete MVP. Implement and verify coherent milestones individually.

**9. User stories and acceptance criteria**

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| US-01 | As a traveler, I choose my destination and start planning | Enabled cities are selectable. Unknown or unsupported cities explain coverage limits. The selected city controls currency/timezone and catalog. No unsupported facts are generated |
| US-02 | As a traveler, I provide essentials without a long form | The initial flow asks for date/time window, manual start and return point, party, budget basis, transport, and strict food requirements. Defaults are visible/editable. Relevant follow-ups appear before generating a plan. Missing required answers are not invented |
| US-03 | As a family, I receive a usable day schedule | Every leg and stop has a nonnegative duration. Arrival plus visit time is no later than closing, arrival respects last admission, breaks and meals are accounted for, the return fits the end time, and excluded places are absent. If any must-visit cannot fit, the plan exposes that conflict |
| US-04 | As a traveler, I understand the group budget | Per-person input converts to a clearly stated party total. Adult/child/party/unit ticket rules are applied only when known. Categories sum without duplicates. Unknown expenses remain unknown; the plan does not claim “within budget” unless the considered upper bound including selected reserve fits |
| US-05 | As a traveler with Jain restrictions, I choose food with adequate evidence | No-onion, no-garlic, no-root-vegetable, and custom requirements can be recorded separately. “Serves vegetarian” alone cannot satisfy strict Jain or pure-kitchen requirements. An unmatched restriction produces a no-match/confirmation-needed state, with dated evidence and user-visible uncertainty |
| US-06 | As a traveler with mobility needs, I understand suitability | Record walking limits, stairs/step-free needs, and rest needs. A wheelchair entrance attribute does not certify an accessible journey. Known violations exclude a candidate; insufficient evidence prevents an unqualified accessibility claim and is shown before confirmation |
| US-07 | As a traveler, I inspect and change a plan | Selecting a numbered marker focuses its stop and vice versa. Add/remove/replace/reorder produces a validated draft with updated timing, costs, and reasons. Hard restrictions and must-visits remain visible. An infeasible edit can be retained as a draft but cannot be silently presented as feasible |
| US-08 | As a traveler running late, I review a recovery plan | Lateness adjusts the remaining day from the recorded current progress, not completed visits. New arrivals are checked against hours and endpoint. Comparison shows removed/replaced stops, meals, extra cost, and time impact. Decline preserves the confirmed plan; accept creates a new version |
| US-09 | As a traveler, I know what an update means | Distinguish provider traffic estimates, historical estimates, scheduled advisories, forecasts, and community claims. Display retrieval/checking time and source observation time if supplied. Never describe request time as observation time. Delay cause is not inferred without evidence |
| US-10 | As a traveler, I ask the assistant for help | The assistant can request missing preferences and propose supported actions. Timing and costs come from validated structured data. A restaurant or stop suggestion resolves to a catalog/provider record. Missing live access yields an honest unavailable response. Chat cannot apply a material itinerary revision without approval |
| US-11 | As a traveler, I retain my plan when something fails | Reload restores the saved version in the same browser. Provider timeout does not erase the plan or fabricate a route. Map failure preserves the timeline. Retry is offered without duplicating stops. Changes from an old revision cannot overwrite a newer accepted version |
| US-12 | As a traveler, I navigate while keeping location control | External navigation is labeled and opens the chosen leg. No GPS request occurs on page load. If optional GPS is enabled, it requests a one-time read only after user action; denial or timeout allows manual input |
| US-13 | As an editor, I keep local facts current | Only an authorized editor can update catalog evidence. Each fact identifies its source, checking date, validity where known, and status. A field with no evidence remains unknown. Retired places stop appearing as new recommendations while saved plans show the changed status |
| US-14 | As the product owner, I add another city | A second, explicitly synthetic city fixture with a different timezone/currency runs through the same generation, budget, edit, save, and revision acceptance checks. City scope prevents cross-city place leakage. No fixture is exposed as a verified real destination |

Guest persistence does not promise offline maps or fresh traffic. Saving a plan should preserve user-owned itinerary structure and independently sourced facts while respecting connected providers' storage rules; precise persistence contracts belong in Phase C.

**Planning and budget rules**

Hard constraints: supported city, date/time window, required endpoint, valid party, strict dietary requirements, known mobility limits, excluded places, and explicitly required must-visits. Treat a user-designated budget ceiling as hard; otherwise label it a target. Unknown facts do not satisfy hard requirements.

Soft preferences: interests, pace, lower travel, more attractions, and optional hidden gems. When constraints conflict, show the smallest practical changes: remove a requested stop, extend the window, raise the budget, or supply missing information. A hard restriction may only change after explicit user input.

Define a budget as a range for the entire party. Costs have an applicable date and unit: per adult, eligible child, vehicle, party, or purchase. Do not assume all children pay zero or that child age alone proves ticket eligibility. Ask about ticket category/nationality only when a source requires it and it affects the plan.

The upper bound includes chosen meals, travel, tickets, parking/tolls, other expenses, and an optional reserve. If costs are missing, show “budget incomplete.” A booked or actual amount replaces the corresponding estimate in the selected total rather than being added again. Accommodation is excluded in the first one-day release and clearly stated in the budget scope.

Planning allowances for queues, parking, and breaks are labeled as allowances. Provider traffic already reflected in an ETA is not added a second time as an event buffer. Future-day routes and old cached estimates cannot be labeled current observed traffic.

**10. Core user journey and key screens**

Primary journey:

1. Select a supported city and view its available planning capabilities.
2. Enter a day, time window, starting/return points, party, and budget; select transport and food needs.
3. Answer relevant short follow-ups: children's ages, pace, mobility, interests, and must-visits.
4. Generate a draft; view sourcing progress and any blocking missing information.
5. Review the map, timeline, meals, budget, and evidence; edit and resolve conflicts.
6. Confirm the plan; start day mode and open external navigation for the next leg.
7. Mark progress, enter a delay, or refresh travel estimates.
8. Review a proposed revision; accept it or keep the current plan.

| Screen | Main content and action | Required exceptional states |
| --- | --- | --- |
| Start | Generic product introduction, city selection, existing drafts; “Plan my day” | No enabled city; unsupported destination; loading city catalog |
| Essentials | Date/time, start/return, party, budget, transport, food; “Continue” | Invalid date/time or amount; missing endpoint; unsupported mode; custom requirement |
| Follow-ups | Contextual cards or conversation with visible editable preference summary; “Build plan” | Conflicting must-visits; unknown place match; absent child ticket detail |
| Generating | Progress for facts, routing, schedule checks, and budget; cancel/retry | Partial data; timeout; no feasible plan; unsupported city coverage |
| Plan workspace | Desktop timeline beside map; mobile timeline with map toggle; date, party, cost, status; “Confirm plan” | Unknown hours/costs; no suitable meal; inaccessible candidate; map unavailable |
| Stop details | Why selected, schedule, group cost, visit constraints, dietary evidence, source, freshness; replace/remove | Closed/retired place; stale evidence; no compatible replacement |
| Budget | Group estimate and categories, range, reserve, excluded scope; “Adjust budget” | Missing expense; estimated upper bound too high; currency inconsistency |
| Day mode | Current and next stop, progress, next navigation leg, lateness input, refresh | Offline/stale estimate; failed refresh; completed day; expired advisory |
| Revision review | Current/proposed versions, differences, reasons and uncertainty; “Accept changes” / “Keep current plan” | Hard-constraint conflict; changed meal evidence; version conflict |
| Editor workspace | City-scoped independent facts, evidence, checking dates, and retirement controls | Unauthorized access; invalid coordinates; absent sources; expired facts |

Product terms must describe facts without implementation jargon: “Travel estimate unavailable,” “Food requirements need confirmation,” “This plan exceeds your available time,” and “You have unaccepted changes.” Do not display an AI success message when routing or feasibility checks have failed.

**State and consent rules**

Maintain separate draft, confirmed, and proposed-revision states. A confirmed itinerary version is immutable. Candidate changes cannot overwrite it. Record acceptance/rejection and compare against the version the traveler actually reviewed. Completed stops remain part of trip history.

Keep strict food, mobility, must-visit, budget, and end-time constraints visible in revision review. If a proposal requires relaxing one, obtain explicit preference changes. On failure or rejection, preserve the user's existing plan and explain any remaining conflict; preserving it is not a claim that old estimates remain valid.

Plans are private by default. No account is required to draft. No public sharing, outbound messaging, continuous GPS collection, or push notifications occurs without a deliberate later user choice. Children are represented through needed party/age details rather than profiles or precise movement tracking.

**Verification targets for implementation milestones**

Use meaningful behavior tests for the planning engine: closing time versus last admission, return leg, meals and breaks, required/excluded stops, party cost arithmetic, unknown cost, unmet diet/access requirements, lateness propagation, rejection preserving the confirmed plan, and stale-version acceptance rejection.

Exercise data failure and UI states: no catalog, no restaurant match, partial route response, timeout, invalid inputs, map failure, and reload persistence. Verify mobile usability, keyboard access, readable evidence labels, and explicit material-change acceptance.

Use two clearly labeled test-city fixtures, one using the initial city dataset shape and another synthetic city with different timezone and currency. Fixture prices, hours, routes, and disruptions are test inputs; never claim they are collected or current facts. Connected-provider tests and field observations are separate release gates.

**Working roadmap into Phases C and D**

Phase C defines the stack, city-aware schema, API contracts, provider access/licensing, error contracts, security, persistence, and operating-cost controls before application code.

Proposed implementation sequence, to be refined in Phase C:

1. M1: city-independent planning foundation, structured preferences, deterministic schedule/budget checks, timeline editing, local draft persistence, labeled fixtures, and behavioral tests. No live-data claim.
2. M2: licensed maps/routing and checked venue catalog; provider failure handling and real-data feasibility checks. Map geometry only comes from an appropriate provider, never straight-line segments labeled road routes.
3. M3: documented dietary evidence, honest assistant tool actions, manual delay recovery, and versioned revision review.
4. M4: authenticated fact maintenance, optional sync, operating limits, monitoring, and controlled user trials; resolve any required release blockers.

Only implement one current milestone at a time. A milestone completion is not a public deployment or a claim that the full MVP is finished.

Phase B outcome: the product is defined for expansion to any city, while its first data evaluation uses Jaipur. Scope and acceptance criteria are ready for technical design. Customer validation and provider field testing remain open; they must not be marked completed by software tests.
