# Compare three plans

Select a destination, starting point, times and preferences, then press **Compare three plans** beside **Plan my day**. This is a separate, explicit action. Ordinary Plan my day and manual recalculation retain their existing behavior.

The comparison uses the same verified attraction shortlist, one shared Google travel matrix and at most one configured AI ranking. The deterministic scheduler evaluates three priorities:

| Style | Priority |
| --- | --- |
| More sightseeing | Maximize the number of feasible matching attractions, up to the existing five-visit limit, then use the existing quality score. |
| Less travelling | Prefer at least two attractions if a feasible pair exists, then prioritize lower matrix travel time. A single attraction remains possible when constraints prevent a pair. |
| Relaxed day | Prefer at least two attractions if feasible and an earlier scheduled finish, normally with at most three attractions. Required stops and locked positions may require more. |

All styles preserve the user's pace, visit allowances, manually edited durations, interests, accessibility/environment restrictions, must-visits, locks, budget checks, starting point and selected return point. Comparison does not shorten user-entered visits or disable meals to manufacture differences. Optional repeated sub-attractions in the same provider-confirmed complex do not pad the sightseeing count. Required pairs remain possible.

Final Google routes are fetched and validated separately for the selected sequences. Midday meals use the existing restaurant, opening-hour and detour checks for each option. Identical final route requests, restaurant searches/validation and meal matrices reuse request-local promises; nothing new is persisted or cached across users. Compared options can be identical; the UI labels this honestly. These priorities are based on a bounded shortlist and departure-time matrix, not a guarantee of global optimality or updated traffic at every later leg.

Cards compare attraction count, meal inclusion, final route travel time/distance, destination-local return time, remaining time before the deadline and the known group cost range. Unknown costs stay explicit, and an unpriced plan is never displayed as free. A provider/quota failure after an earlier successful option keeps that option available and marks remaining options unavailable without automatic retries. Shared prerequisites such as a failed AI ranking or initial matrix return the existing actionable request error.

Selecting a card updates the route/itinerary preview locally, without another planning, ranking or route request. Normal selected-place photos or festival checks may still load through their existing flows. Selection resets the acceptance acknowledgement. Only **Accept this guided itinerary** saves the selected plan using the existing accepted-trip storage and sharing mechanisms. Comparison alternatives are transient, disappear when planning inputs or stop constraints change, and never replace an accepted saved trip automatically. Expired routes cannot be selected or accepted. Cancellation and sequence checks prevent stale responses from publishing options for older inputs.

`POST /api/guide/compare` uses the existing authenticated, owner-bound evidence receipts, idempotency checks and provider/AI spending guards. It accepts the normal guide plan request in smart mode and returns one ready or unavailable result for each style. There is a four-comparison-per-minute route limit. Client timeout is 80 seconds, with the existing overall 90-second UI deadline; there are no new environment variables, keys, billing changes or dependencies. Comparisons use more final route/meal checks than one ordinary plan, so existing provider quotas can still stop them.

Tests: comparison/domain/API cases in `tests/guide.test.ts`, deadline coverage in `tests/http-timeout.test.ts`, and desktop/mobile selection, acceptance-only saving, stale-response, expiry and partial-failure cases in `tests/e2e/compare-plans.spec.ts`. Fixtures remain confined to tests.
