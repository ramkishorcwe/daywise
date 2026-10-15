# Local festival traffic checks

Daywise compares the travel date with published festivals relevant to the selected city, state, country and month/year. Search covers local processions, fairs, regional celebrations, religious festivals and national observances; it is not limited to a predefined festival list. No source guarantees every local or unpublished event. No match is not an all-clear for traffic. Preview, accepted and reopened guided itineraries use their own departure date in the destination timezone. Draft edits never change an accepted itinerary's advisory.

After a destination/date selection settles, a debounced festival lookup searches that city/month through Gemini with Google Search grounding. It does not call Plan my day, save a draft, change route order, add arbitrary delays or modify prices. Day changes within the same month compare locally without another AI call. Late responses cannot overwrite a newer selection. Search-derived dates need confirmation from linked sources; they are not verified road closures. Check current navigation and local traffic notices before departure.

Only source-linked, date-specific rows matching the requested city/country/month are usable. Invalid dates, unrelated cities/countries, unsupported URLs and ungrounded model output are excluded. Errors stay inside the advisory and offer explicit retry; no automatic retry is sent. Empty/incomplete results never imply traffic is clear. Google grounding sources and supplied Search suggestions are displayed; suggestions use an isolated iframe with scripts/top navigation disabled.

## Configuration, caching and quotas

Uses the existing server-only `GEMINI_API_KEY`. Enabled by default in `ASSISTANT_MODE=gemini`; set `FESTIVAL_SEARCH_ENABLED=false` to disable. The existing `GEMINI_MODEL` must support Google Search grounding, or set an independently evaluated `FESTIVAL_SEARCH_MODEL`. No new browser key is needed. See [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search) and [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) for model availability, search quotas and charges, which differ from ordinary text generation. This change does not enable account billing or raise provider limits.

Each fresh city/month search reserves one app AI call; Gemini may execute multiple search queries within it. Search shares the existing AI allowance, retaining up to ten remaining calls for explicit planning (or one fifth of a small configured limit). Hosted reservation uses the existing atomic Firestore counter. Normal planning's limit is unchanged.

Successful public city/month results are cached for one hour in browser session memory and each warm API instance. Concurrent identical requests share a pending lookup. Caches are not guaranteed across page reload/server cold starts. Server bounds: six requests per user per minute, ten concurrent searches and eighty cached city/months per instance. Browser cache: twelve entries, with a brief failure cooldown that explicit retry can bypass. No persistent event catalog or user's GPS/start/address is sent to search. Only destination city identity, state and month are queried. Searches support last year through the next four years; remote years may lack published schedules.

## Reviewed calendar supplement

Calendar reviewed on **15 October 2026**:

- [Rajasthan Tourism 2024–2030 calendar](https://www.tourism.rajasthan.gov.in/content/dam/rajasthan-tourism/english/pdf/FairsandFestivals.pdf): Jaipur Gangaur/Teej 2026–2030, Udaipur Mewar 2026–2027, Jodhpur Marwar 2026–2027. Inclusive start/end dates are transcribed as published, with no extrapolation to unlisted years.
- [Rajasthan Tourism Jaipur page](https://www.tourism.rajasthan.gov.in/jaipur.html): Gangaur/Teej procession context around City Palace, Tripolia Bazaar and Chhoti Chaupar. This is not an annual traffic-closure notice.
- [Rajasthan Tourism Gangaur/Mewar description](https://www.tourism.rajasthan.gov.in/travel-diaries/itvaSthan.html): Udaipur procession/Lake Pichola context.
- [Rajasthan Tourism festivals page](https://www.tourism.rajasthan.gov.in/fairs-and-festivals.html): Marwar/Jodhpur venue context.
- [Government of India IIRS/ISRO 2026 holiday calendar](https://www.iirs.gov.in/holidaycalender): Holi, Ram Navami, Janmashtami, Dussehra, Diwali, Guru Nanak Jayanti and Christmas. Country-level notices say celebrations **may** affect nearby roads; impact varies by locality. No assumed extra days before/after a holiday and no guessed dates for moon-sighting observances.

These reviewed entries supplement live search, including during provider failures or when live search is disabled. **Festival coverage** explains the limits. The shared-link payload has no validated country/city identity, so warnings are not inferred from a shared title, currency or private starting location.

## Updating the calendar

Edit `packages/domain/src/festival-calendar.ts` after checking a current official source. Each event needs a unique ID, country code, exact city aliases for local events, explicit ISO date ranges, source link and review date. Do not use substring matching, hardcoded coordinates, a lunar date repeated every year, or an AI-generated event date. Keep source date corrections in a reviewed change and add a date/boundary test. Event dates may change after publication; the UI links the calendar for confirmation.

The reviewed matcher is in `packages/domain/src/festival-traffic.ts`; live integration is in `packages/data-adapters/src/festival-search.ts`, `apps/api/src/festivals.ts` and `apps/web/src/components/LocalFestivalCheck.tsx`. Tests cover grounding/source validation, dates/location scope, auth, monthly/concurrent caching, AI headroom, failures/retry, stale responses, mobile layout and unchanged explicit planning/saving. No dependency was added.
