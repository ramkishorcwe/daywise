# Milestone 15 — find saved days

12 October 2026. Adds a finder to **Saved plans** so a growing collection across supported cities remains usable. Search/filter/sort changes affect the visible cards only; they never modify, delete or recalculate saved days.

## Try it

Open **Saved plans**. Search by day name, city name or local date (`YYYY-MM-DD`). Search ignores letter case, normalizes Unicode text and matches all space-separated terms across those fields. Combine it with **Saved city** and **Saved day status**. City choices come from the saved records, including destinations unavailable in the current catalog, rather than assuming a particular city or currency.

Statuses are exclusive: **Draft only**, **Confirmed, no progress**, **Progress reported** and **Return reported**. Progress requires a report bound to the current accepted version. Completing every itinerary stop without an arrival report remains progress, not a reported return. These are manually reported, unverified states; dates or the device clock never imply completion. A confirmed record can still contain unaccepted draft edits.

Sort by most recently saved, earliest travel date or latest travel date. Travel dates are destination-local calendar dates from the current draft preferences, as shown on each card. They are not converted to UTC or taken from a different accepted snapshot. Equal sort keys use stable day IDs. Each card names its city, currency and available timezone.

The count shows visible cards out of the complete loaded collection. **Clear filters** resets search/city/status while keeping the chosen sort. A no-match state offers **Show all saved days** and explicitly distinguishes filtered results from an empty collection. Open/reuse/travel-copy/delete still target the selected record; backup/restore still uses the active day. Creating a copy under an active filter can leave it hidden until filters are cleared.

Finder choices are temporary for this view. Opening a day or leaving/reopening the collection returns to default choices. No query is written to storage, a URL, analytics or a backend. There is no account, network search or new paid call.

## Loading and failures

**Refresh saved days** uses the existing local save/read flow. It first saves the active day, then reads the collection. Loading is explicit. On save/read failure, previously loaded cards and current finder choices remain available with an error and retry. A failed read is not presented as an empty or successfully refreshed collection. Unsupported/invalid records retain the existing non-destructive storage policy; an unavailable destination cannot be reused and opening explains the missing coverage.

Filtering and sorting work on a separate array and preserve all source records, accepted schedules, reports, costs and backend identities. This does not add cross-tab synchronization or change ordinary autosave/deletion behavior. No database migration, dependency, provider access or live venue evidence is added. Existing release gates remain pending.

## Verification

Three added browser journeys check combined search/city/status/date ordering against an unchanged stored collection; distinct progress/return filters with creation/deletion of a filtered separate draft; and Unicode names, 320px phone layout, failed refresh and recovery. Existing domain/API/provider checks, production build, client credential scan and dependency audit run through `npm run check:release`. Point-in-time evidence is in `artifacts/release/report.json`.
