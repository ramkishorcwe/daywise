# Milestone 13 — explicit local return reporting

12 October 2026. Completes the local follow-my-day flow with an explicit arrival report at the chosen return point. No API, GPS read or automatic completion is used.

## Try it

Confirm/save a day, then record all itinerary stops complete in **Follow my day → Local day updates**. The return still remains until arrival is reported. For a local/offline day, **Report return arrival** opens a form naming the return point and destination timezone. The arrival date defaults to the planned day; arrival time starts blank. Enter the date/time you arrived and choose **Save return report**.

The overview then shows **Day reported complete**, the reported arrival date/time, and its unverified manual source. Saved plans label it **Return reported**. The accepted itinerary, planned return estimate, completed-stop data, budget and expense records remain unchanged. No new confirmation/version is created and expense records do not become stale just because return was reported. Completing all stops or reaching a scheduled clock time never marks the return automatically.

**Review return report** allows correction of only the arrival metadata. Correcting it does not reopen progress or change the itinerary. Completed days refuse progress/replanning and require a separate day for new plans. A pending assistant callback cannot attach its workspace or apply a revision to a completed/local day or a different active day. Backend-linked days retain their existing assistant workflow; this milestone does not close a remote trip.

## Validation, privacy and recovery

Arrival requires a valid unambiguous local date/time, cannot precede the last reported departure, and cannot be later than the device reporting clock. A late return, including a later local date, is allowed without rewriting the accepted deadline/estimate. No route-duration estimate is treated as proof of actual arrival. Ambiguous/nonexistent DST times are refused rather than guessed. Device clocks and manual reports are not independent evidence.

The optional completion record contains the matching confirmation ID, arrival/report timestamps and `user_reported_unverified` source. Runtime validation requires a matching local workspace, a positive progress revision and the entire completed prefix. Unknown fields/sources, mismatched versions and inconsistent chronology are rejected. Existing records without completion keep their previous behavior; no database version change or destructive migration is needed.

Reporting/correcting uses the existing cancellable worker and guarded read/write transaction. Storage failure or a changed/deleted saved record cannot mark the active day complete. Source context is rechecked around saving. Current-catalog facts are not recalculated or renewed merely to record a return; an older catalog snapshot remains labeled and can be reported while its references are supported. Unaccepted draft changes still require review or keeping the accepted plan first.

Private editable backups preserve the completion record and restored copies remain complete. Files are unsigned and validation establishes structure, not authenticity. Read-only travel copies and budget exports continue to exclude return reports; earlier downloads are independent copies and corrections cannot recall them. The browser report is not uploaded to the backend, cloud or a provider. Correcting replaces that browser arrival record; no immutable audit history is introduced.

No new dependency, live travel claim, location permission, paid call, account or deployment is introduced. Actual expense amounts remain separate, manually reported records.

## Verification

The suite contains 132 unit/domain/API/provider checks and 45 Chromium journeys. New domain checks cover full-prefix/terminal guards, unchanged snapshots/progress/expenses, invalid/future/backwards/DST times, late USD arrival, backend/unaccepted/old-catalog contexts, completion schema integrity, private backup and corrections, and exclusion from read-only travel copies. Browser journeys cover explicit report/correction/reload/download, failed storage and invalid times, phone/next-day USD behavior and a delayed backend baseline that must not attach after local completion.

Run `npm run check:release` for point-in-time evidence in `artifacts/release/report.json`. Public/live release gates remain open in `operations.md`.
