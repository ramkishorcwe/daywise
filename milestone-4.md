# Milestone 4 — local operations and release checks

Implemented 11 October 2026. The local operating tools are complete; external release checks and controlled traveler trials remain pending. Daywise remains city-independent, with Jaipur only the initial fictional dataset and a second currency/timezone fixture.

## Delivered

- Offline catalog/branch-food maintenance with strict schemas, review snapshots/digests, current evidence checks, revision conflicts, separate reviewer attestations, bounded audit references, a writer lock and atomic active-state replacement. Approved route catalogs load at API restart; dietary evidence remains a private maintenance record, not a live recommendation. No researched catalog is fabricated.
- Separate local operator diagnostics with aggregate route/latency/error counts and provider/AI allowances. Normal trip sessions and browser requests cannot access them; no private request data enters telemetry. Allowances remain explicitly per process, with restart/UTC-day limitations.
- A planning-availability panel, owned private-trip exports, and clear deletion scope. Deleting a backend trip releases cached private responses and pending reviews, preventing old request keys from returning erased data. Private process entries also receive idle expiry cleanup.
- Development filesystem denies for `.local`, `.tmp`, private catalogs, environment/credential files and Git metadata.
- `npm run check:release`: local tests/build/browser/dependency/client credential checks and a source-digest report; isolated check ports/storage and zero paid-call allowances. `--require-live` cannot pass with external gates pending. A CI workflow and operating/recovery/trial runbook are supplied.

## Try it

Open **Data connections** to see planning availability. Connect, save a private backend trip, export it or explicitly delete it. Browser drafts and downloaded exports are separate copies.

```powershell
npm run ops -- status
npm run ops -- catalog-status
npm run check:release
```

Catalog-stage/review commands, credential boundaries, retention and crash recovery are documented in [operations.md](operations.md). No operator-write endpoint or hidden browser admin role was introduced. Recorded reviewer aliases are not authenticated independent people; hosted maintenance requires real roles and tested authorization.

## Verification and release boundary

81 unit/domain/API/provider/operations checks and 11 Chromium journeys are expected by the full local check suite. The generated [release report](artifacts/release/report.json) records the actual run results, dependency audit and client scan. TypeScript and the production build are part of that same command. Desktop/mobile availability and export/deletion/error states are covered by browser checks.

Local tests cannot establish real dietary accuracy, live route behavior, cloud permissions, source licenses, production AI quality, actual operating cost or traveler demand. No cloud emulator/real provider/AI smoke test, participant outreach, controlled trial or deployment is claimed. Public readiness is deliberately false until those gates are validated and the concrete release is reviewed and authorized.
