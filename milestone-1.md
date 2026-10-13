# Milestone 1 — local planning foundation

Completed on 9 October 2026. The interface uses **Daywise** as a working name. Jaipur is an initial test dataset, while city, currency, timezone, catalogs and travel graphs are separate inputs to the planning engine.

## Delivered

The responsive React/TypeScript app runs locally with progressive preferences, a deterministic worker-based scheduler, group budgeting, meals, rest and a return journey. It checks opening/last-admission times, strict dietary evidence, child eligibility and mobility constraints against explicitly fictional fixtures.

Travelers can add, remove, replace and reorder stops. Infeasible edits show reasons and an undo action. Confirmed plans remain independent snapshots; draft changes require review and acceptance. Drafts and confirmed snapshots save in IndexedDB and can be reopened locally. Runtime schemas validate preferences and saved records; unavailable storage and worker failures have visible recovery messages.

The interactive schematic shows an abstract test graph. It does not represent streets, traffic, GPS positions or a navigation route. A synthetic Harbor City fixture exercises USD and America/New_York separately from Jaipur's INR and Asia/Kolkata.

## Verification

- 31 domain tests passed: constraints, group costs, return travel, dietary/mobility evidence, child rules, DST, independent cities, version safety and corrupted records.
- Five Chromium browser journeys passed: confirmation/restoration, unsupported dietary evidence, acceptance of a changed snapshot, undo of a rejected lunch removal, and phone layout/city switching.
- TypeScript checking and the Vite production build passed.
- Desktop, preferences dialog and 390-pixel phone screenshots were visually inspected. The initial browser check found no runtime errors, external requests or horizontal overflow.

Run `npm test`, `npm run build` and `npm run test:e2e` to repeat the automated checks. With the local server running, `node scripts/visual-check.mjs` writes screenshots to `artifacts` and checks browser errors, external requests and phone overflow. Screenshots are review artifacts rather than regression baselines.

## Reliability, performance, security and cost

Planning runs off the main UI thread with cancellation, a timeout and a bounded candidate search. The solver does not claim global optimality. Preferences load on demand; fonts are local. The main production script is approximately 111 kB compressed, plus separate worker and preferences assets. No claim of field-device performance or production readiness is made.

No API key, paid service, cloud infrastructure, location permission or AI call is used. Plans remain in this browser; clearing browser storage removes local records. Schema validation and React text escaping are in place. Invalid or unsupported stored records are preserved for later recovery. Public-release authentication, authorization, abuse controls, licensed provider persistence and measured billing remain later work.

## Boundaries and next milestone

M1 supports one city-local day, car travel with walking connectors, up to twelve travelers, five visits and one meal. Manual anchors and every travel fact are software fixtures. Actual venue research, dietary verification and customer interviews have not been completed by this implementation.

M2 will connect the backend, licensed place/routing providers and a checked catalog, following `phase-c-architecture.md`. Live data cannot be claimed until provider access, licensing, billing limits and catalog evidence are established. AI-assisted planning and disruption proposals remain M3. No public deployment was performed.
