# Selected preferences and interest coverage

The planner attempts to cover **every selected interest** when a feasible combination exists in its verified shortlist. Matching any one interest is a requirement for an individual sightseeing visit; it is no longer sufficient for the whole day. The five-attraction limit, real provider route/opening data, user durations, known budget limits, locks and return deadline still apply. Coverage is bounded by the shortlist and routing checks, not a promise that every possible venue or schedule in a city was evaluated.

## Discovery

Google Places Text Search runs a separate query for each unique selected interest, rather than one combined query that may predominantly return restaurants. Empty interests use one general discovery query. The existing key and field mask are reused. At most twelve searches run, with concurrency bounded to three; every request after the first invokes the existing provider spending guard before it starts. Failure is actionable; no sample places or silent fallback query is used. Limits and billing settings are unchanged.

Results are deduplicated and checked against the selected interests, indoor/outdoor evidence, wheelchair entrance requirements, known child suitability and reported food conflicts. The eight-place shortlist first adds uncovered interests, then balances alternatives across represented interests rather than taking only the eight most popular results. Reverse geocoding still validates the actual locality. Unavailable interests produce discovery warnings. The matrix remains bounded to ten points and final attraction visits to five.

Museum coverage requires a provider museum type; a cafe with Museum in its name does not count as a museum. Dining venue names do not establish a fort, palace or garden. Cultural museums and provider retail-store types are recognized. Other categories remain inferred from provider types/names as documented in the existing guide; historical significance and detailed venue claims are not independently verified. Hidden gems retains the explicit lower-review-count proxy, not a claimed secret or verified unique venue.

## Scheduling and AI

AI ranks only verified candidates and proposes allowances. It cannot remove an interest by omitting its candidates from its first recommendation. Smart scheduling retains all eligible supplied candidates. Across ordinary planning and all three comparison styles, the number of feasible covered interests takes priority before popularity, visit count, route distance/time or relaxed pacing. With equal coverage, ordinary Gemini planning favors its recommended visits rather than filling time with arbitrary extra stops. Must-visits, locks, user-entered durations and budget/opening/deadline checks remain hard constraints.

Relaxed day extends generated allowances as described in plan-comparison.md and normally favors at most three visits. It can use four or five when necessary to cover more feasible selected interests. Redundant same-complex visits stay discouraged; distinct sub-attractions may remain when they add distinct selected interests. Longer allowances never bypass actual opening windows or the deadline.

Nightlife is scheduled from **18:00 destination time**, with provider opening hours still required where known. This is an application scheduling convention, not a claim about the city's universal nightlife hours. A daytime bar/restaurant visit cannot be marked as nightlife coverage. An explicit daytime appointment is not silently moved. A validated midday meal counts as food coverage only; it does not satisfy museum/nightlife interests through a restaurant's name. Meal discovery, detour, dietary and return checks remain in force.

Known contradictory food information is excluded for both regular food visits and optional lunch. Unknown preparation, vegan/Jain kitchens, paths, facilities and prices are not converted into verified claims. An accessible entrance is not proof of complete wheelchair access. Existing unverified-fact warnings and acceptance acknowledgement remain necessary.

## Review and saving

New plans contain an optional, backward-compatible interestCoverage audit. The review and comparison cards show how many selected interests are included. Omitted interests get a reason: no verified match in the reviewed shortlist under the selected preferences, no evening time for nightlife, a manual choice, or inability to fit the checked time/opening/required-stop/known-budget/visit-limit combination. Missing evidence does not claim that the city has no such places. Partial cost ranges are never labeled a complete budget fit.

The audit belongs to the actual selected schedule and remains with the accepted local trip across refresh. Editing preferences invalidates the preview without generating another plan. Only explicit planning makes requests and only acceptance saves. Old saved plans without an audit remain readable; regenerate them to obtain the new checks and current provider information.

Tests cover all twelve interests, combined museum/food/nightlife requests, AI omissions, popularity-dominated discovery, per-query accounting/concurrency, short daytime windows, hard preference conflicts, all comparison styles, and mobile/desktop audit rendering and accepted-trip restoration. Test-only fixtures never become production fallbacks.
