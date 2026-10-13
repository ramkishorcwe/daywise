# Milestone 7 — read-only travel copies

11 October 2026. Completes a local version of Phase B's read-only sharing/export feature without creating a public link, account, deployment or paid-provider connection. Daywise remains independent of its Jaipur and Harbor City test datasets.

## Try it

Confirm a day, then choose **Travel copy** beside **Save draft**. Preview the accepted schedule, including visits, meals, rest breaks, planned arrival/departure, incoming travel, planned waits, the starting point and the return journey. The city timezone and fixture source remain visible. The action is disabled for an unconfirmed day. It also works from **Saved plans → Travel copy** for a confirmed saved day, without replacing your active draft.

**Download travel copy** creates a self-contained HTML file that can be opened in a browser without the app or API. It contains no scripts, external assets or navigation links. **Print travel copy** opens the browser's print flow with only the travel sheet; the sidebar, other application content and dialog controls are excluded. A browser may offer saving as PDF. Previewing or downloading does not publish a URL or send the itinerary to anyone. Share the file yourself only if you choose.

The file exposes its date, schedule and starting/return labels, as the preview states. Dietary/accessibility preference fields, ages/group details, trip/backend IDs, precise coordinates, assistant conversation, reported progress and booked/actual expense records are excluded. Stop reasons are excluded too, since they can describe preference matching. The route is still a fictional itinerary and does not establish real-world suitability or navigation. The itinerary itself may reveal choices such as meal venues; privacy means limiting fields, not making a shared day anonymous.

**Include estimated group budget** is unchecked every time a new preview opens. Opting in includes the accepted fixture category estimates, reserve and whole-group ceiling, with excluded accommodation/actual costs labeled. It never exports the local expense projection. The preview and downloaded document use the same minimal copy model; all dynamic HTML text is escaped. A restrictive content policy disables script execution and remote content in the downloaded file.

## Snapshot behavior and failures

Copies always use the accepted snapshot, including accepted delay times. Unaccepted edits remain excluded and are disclosed above the preview. The preview captures the chosen session/version when opened, so a later callback cannot silently change what is being reviewed. An older fixture catalog is labeled; generating a copy does not recalculate, revalidate real facts, approve new changes or mark stops complete.

Unsupported/corrupt accepted snapshots cannot be exported. A file-preparation or print exception reports the failure and preserves the accepted day. No API/backend is needed. Print layout and browser journeys are checked in Chromium; native print-dialog completion remains a user action. The downloaded file can be opened/printed later in a compatible browser.

This is a static travel copy, not a backup: it cannot be imported to restore editable preferences, expenses or assistant history. Exported/printed copies do not receive later revisions. There is no hosted access control, revocation, collaboration or automatic recipient delivery. Deleting a saved day cannot remove copies already downloaded, printed or sent.

## Checks and remaining gates

The full suite now contains 98 unit/domain/API/provider checks and 23 Chromium journeys. New checks cover exact accepted times, default privacy, optional INR/USD estimates, HTML escaping, script/remote-content absence, stale catalogs, accepted-versus-draft behavior, 320-pixel layouts, preview/file content parity, print isolation, download/print failures, saved-day isolation and consent reset. Run `npm run check:release` for the point-in-time result in `artifacts/release/report.json`.

Live city facts, licensed navigation, cloud/provider/AI validation, durable production controls and controlled traveler trials remain gated in `operations.md`. No real dietary/venue evidence, paid calls, participant contact or public deployment is added in this milestone.
