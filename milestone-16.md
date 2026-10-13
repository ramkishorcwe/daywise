# Milestone 16 — starting-point choices and opt-in location preview

12 October 2026. Implements the requested starting-point UX: **Change start** in the itinerary, **Use my current location**, **Choose a place**, and a default **Return to the same place** option.

## What works locally

Choose **Change start** to open preferences at the starting-point panel. Opening the app/panel never requests location. **Use my current location** triggers one browser geolocation read and the browser's permission controls. The preview shows validated latitude/longitude, reported accuracy and observation time. Denial, unavailable/insecure context, invalid/old response, timeout and thrown browser failures have a manual recovery path. A ten-second acquisition timeout and fifteen-second overall bound prevent an unanswered permission request from leaving the UI waiting indefinitely. There is no watcher or background tracking.

**Choose a place** accepts address/place text and searches the selected city's fictional test starting points locally. Matching demo choices are explicitly labeled. Selecting one updates the draft starting point; when return-to-same-place is checked, the return point follows it. Uncheck to select a different return. Existing separate start/return choices are preserved when editing. Changing the destination resets location/address previews and selects that city's defaults. Late callbacks cannot replace a manual choice, new city or closed panel.

Location/address previews exist only in the form's memory. They are cleared on mode changes, destination changes and closing. No coordinates, accuracy, observation timestamp or typed address is added to TripInput, IndexedDB, private backups, backend trips, query URLs or application logs. The browser/OS may use its own location service under its permission settings. Location is browser-reported, not verified GPS or proof of travel.

## Real routing remains unavailable

The current day planner has fictional anchors and abstract travel edges, without real entrance coordinates. A captured current point or arbitrary real address cannot be mapped to those edges. Real-address lookup and itineraries from a real source require connected licensed maps/routing, independently reviewed city facts and integration of those real sources into the live planner. A provider key alone is insufficient.

This limit is disclosed before using location and beside any preview. The preferences action is disabled while a real current/address source is selected. It never silently substitutes a demo anchor or describes a test plan as starting at the real device position. An explicit **Choose a test starting point** action restores the usable test flow. Cancelling leaves the active day/confirmation untouched. Source changes after reported progress still require a separate day.

This milestone captures a real browser location and improves manual demo selection; it does **not** complete routing from arbitrary real-world sources, geocoding, map picking, automatic city detection, navigation or continuous live location. No cloud resources, new dependencies or paid calls are added.

## Verification

Five focused tests cover bounded coordinate/time validation, secure/supported context, fresh one-shot options, sanitized browser failures and overall timeout with late response. Four browser journeys use synthetic permission-controlled coordinates to check explicit activation, accuracy display, no saved-coordinate/API leakage, denial/manual selection, return behavior, late callbacks, city resets, arbitrary-address gating, accepted-plan preservation and 320px layout. No test reads the user's real device position.

The full suite contains 142 unit/domain/API/provider checks and 55 browser journeys. `npm run check:release` records point-in-time build, audit, client scan and source-digest evidence. Live release gates remain pending.

Browser behavior reference: [MDN — Geolocation.getCurrentPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).
