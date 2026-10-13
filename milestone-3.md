# Milestone 3 — local assistant and approved day revisions

Implemented on 10 October 2026. The local portion is runnable without paid credentials. Jaipur remains only a fixture dataset; the same revision engine is tested with a USD/America/New_York city. No live disruptions, dietary verification, AI account connection or public release are claimed completed.

## Try it

Run `npm run dev:api` and `npm run dev`. Confirm the visible day, open **Travel assistant**, and choose **Use my confirmed plan**. That explicit action seeds a private server workspace by recomputing the exact accepted order and checking that it matches the browser snapshot. A changed fixture schedule requires a fresh baseline rather than silently replacing the user's choices.

The default banner says **Local assistant · AI not connected**. Supported single requests include:

- `Summarize my plan` — server-derived budget, visit count and return time.
- `Show Jain food evidence` — supports/unknowns for every relevant fixture rule, with a fixture source and no real checking date.
- `Delay 30 minutes` — records an additional thirty minutes at the current anchor and prepares a revision when feasible.
- `Use relaxed pace` — proposes a different remaining pace without removing completed stops or relaxing strict constraints.
- `Remove Old Quarter Market` — proposes removal of a named optional, unfinished visit.

Group/children changes, ambiguous or combined requests and unsupported preferences require explicit clarification or a separate new baseline. A claimed procession, closure or traffic jam does not establish a delay or detour. Food queries do not change dietary preferences; unknown evidence is not supported evidence.

## Progress, proposals and confirmation

**Record progress** marks a growing prefix of the confirmed timeline, including rest breaks. Its numeric delay is total lateness at that selected anchor; chat delay requests add an additional amount. Actual departure cannot move backward. There is no GPS collection and no inference that a visit has been completed.

Reported progress has its own revision and remains recorded when a proposal is rejected. The old confirmed schedule then has potentially outdated remaining estimates, which the interface labels. Completed times and projected costs remain fixed; they are not presented as verified actual spending. The solver starts remaining travel at the reported anchor/time, checks the return, reserves spent projected costs/walking, preserves lunch/rest requirements and retains must-visits, diet, accessibility and budget limits. It first tries the previous order for a delay, then evaluates bounded alternatives. It can return directly after all visits are completed, but does not invent new visits or drop a missed mandatory meal.

Proposals include immutable input/plan snapshots, a change summary, source/catalog revision, expected trip/confirmed/progress revisions and a ten-minute expiry. Creating a proposal does not update confirmation. **Accept revision** atomically updates the server confirmation, preferences, revision and acceptance history; then the accepted snapshot is applied to the browser. **Keep confirmed plan** rejects the proposal without undoing reported progress. Foreign, stale and expired decisions fail, and simultaneous accept/reject requests cannot both succeed.

Browser workspace metadata saves in IndexedDB so closing the dialog or reloading reconnects to the same private server trip. General regeneration/edit confirmation is blocked for a day with reported progress: use proposals or explicitly start another day. Local tab identity expiry and one-process server limits from M2 still apply. If the workspace cannot be accessed, the browser confirmation is preserved and the UI reports the problem.

## Optional OpenAI connection

The `openai-docs` skill and current [official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling) guided the optional adapter. Set `ASSISTANT_MODE=openai`, a server-only `OPENAI_API_KEY`, and an evaluated/pinned `OPENAI_MODEL`, then restart the API. No model or account access is presumed, and no API credential belongs in frontend `VITE_` variables.

The Responses adapter requests exactly one strict classification function, with a bounded output, no parallel calls and `store: false`. It supplies the message and a small list of fixture place IDs/names. It does not send the full private trip, ages, precise coordinates or route payloads as context; a user can still include personal information in their own message. No persistent chat store is created.

The model chooses an allowed intent; the server validates it and executes the domain action. Model prose is ignored. There are no model tools to confirm, accept, relax hard constraints or fetch arbitrary sources. A delay must match an explicit amount in the user's text. Malformed, incomplete, quota and network responses preserve the current plan and return an error rather than silently pretending that local mode is AI.

The API defaults to at most 20 OpenAI interpretation attempts per UTC day per process (`AI_DAILY_LIMIT`, zero disables them), a 512-token output ceiling and a twelve-second provider deadline. This is a development request allowance, not a monetary billing cap or measured production cost. Provider/model account behavior, retention, pricing, latency and accuracy still require connected evaluation before release. Tests use simulated Responses payloads; no real OpenAI call was made.

## API and data changes

- `POST /api/assistant/turns` — authenticated, revision-scoped message; returns deterministic facts or a proposal and current trip state.
- `POST /api/trips/:id/progress` — expected trip/progress revisions, completed-prefix count and total anchor lateness.
- `POST /api/trips/:id/proposals/:proposalId/accept` and `/reject` — owner/version/progress/expiry checks.

All operations use strict schemas and scoped idempotency keys. API records gain optional progress/history fields so M2 records remain readable. Browser records gain optional assistant workspace metadata. At most twenty acceptance-history references are retained per trip. Candidate proposals are bounded to 500 and expire in process memory; restarting the API requires fresh proposals. Durable shared proposal storage/leases and retention remain release prerequisites. No paid provider call executes inside a repository/Firestore transaction.

## Verification and remaining work

66 domain/API/provider checks pass. Added cases cover retained completed stops, exactly one delay, rest/lunch preservation, direct return after completion, deadline/currency/timezone checks, ownership, stale/expired/concurrent decisions, unchanged confirmation on rejection, food unknowns, ambiguous family requests, strict model output and prevention of inferred delay amounts. TypeScript and production build pass.

Nine Chromium journeys pass, including assistant rejection/acceptance, food evidence, mobile progress and workspace restoration. Desktop and phone evidence/review screens were visually inspected; the visual run reported no runtime errors, external browser requests or horizontal overflow. The assistant loads separately, approximately 3.3 kB compressed; the main script remains about 111 kB compressed.

Real dietary evidence collection/expiry workflows, a complete checked itinerary catalog, departure-aware live routing, authenticated advisory ingestion, real Firebase/provider smoke tests and production AI evaluations remain unavailable without sources/accounts and have not been marked verified. M4's operating and release work must keep those gates explicit; a production trial cannot be justified by passing fixture tests. No deployment was performed.
