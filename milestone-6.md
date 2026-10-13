# Milestone 6 — local booked and actual cost tracking

11 October 2026. Adds the scoped booked/actual expense feature from Phase B without creating accounts, making payments or connecting paid providers. Daywise remains city-independent; Jaipur and Harbor City are fictional catalogs.

## Try it

Confirm a plan, then open **Trip budget**. The accepted fixture estimate stays visible beside a projection using your reported costs. Select a category and cost status, enter the full category total for the whole group, and choose **Save category amount**. An actual total replaces a booked commitment for that category; either replaces the category estimate. Neither is added to the same category estimate. The original confirmed plan is unchanged.

This version supports one booked and one actual amount for each of tickets, food, car transport, parking and other expenses. Enter all applicable taxes/fees in the category total. It does not support individual receipts, deposits, partial-category purchases, refunds or multiple booking line items. Saving replaces the previous amount for that category/status; it is not an immutable transaction history. The UI makes this scope explicit. Amounts are reported by the user and unverified; saving never makes a booking or payment.

Actual category totals and booked commitments without an actual total are shown separately. Zero is valid. Removing an actual amount restores the current booked amount, or the fixture estimate when none is present. Removing a booked amount restores the estimate unless an actual total is present. The accepted reserve allowance remains in the projection and is never classified as spending or a booking. Accommodation remains excluded. Large reported totals can exceed the budget; the overrun is visible. The solver still checks fixture estimates against the hard planning budget and does not reinterpret reported costs as new venue prices or prove remaining-day feasibility.

## Saved days, revisions and currency

Records are saved with their browser day in IndexedDB. Existing M1–M5 records remain compatible because the expense ledger is optional. The ledger validates city, currency, integer minor units, the accepted version and the bounded category/status slots. Currency conversion is not performed; input precision follows the selected city's exponent. Per-person budget input is already converted to the accepted whole-group budget before comparison.

Unaccepted edits do not change expense totals: the budget tracker uses the accepted plan, even when a separate draft cannot be generated. On any accepted plan revision, previous amounts remain visible with **Needs review** and are excluded from the projection. Edit and explicitly save each still-applicable amount against the new version. Review applies even to delay-only revisions, because this release does not automatically infer which full-category commitments remain valid. The original amounts are retained until edited or removed. The expense editor resets on a new day/version, and its parent rejects updates for a stale day/version.

Starting another day or changing cities saves the current session first; a saving failure preserves the current day and explains the issue. A new day/city has no expense amounts from the previous one. Device autosave status distinguishes successful persistence from an amount retained only in memory. Browser storage clearing/unavailability can lose unsaved data; there is no cross-device expense sync.

**Export this budget** downloads a private JSON copy of the accepted fixture snapshot and all reported amounts, including records awaiting review. The export labels fixture estimates and unverified user reports. It excludes backend identity credentials and provider payloads. Downloads are separate copies; deleting browser/backend data cannot remove them. Backend trip exports do not include the browser ledger. Import/restore from the download is not implemented.

## Validation and remaining scope

The suite now contains 92 unit/domain/API/provider checks and 20 Chromium journeys. New checks cover replacement precedence, zero totals, removal fallback, fixed reserve, budget overruns, revision review, currency isolation/precision, schema compatibility, offline reload/export, unusable drafts, saved-day separation and storage failure. `npm run check:release` produces the point-in-time result in `artifacts/release/report.json`.

Live city planning, verified facts, cloud authorization, provider/AI validation, production controls and traveler trials remain gated in `operations.md`. The ledger is local and does not certify bookings, receipts, remaining prices, field validation or public release readiness.
