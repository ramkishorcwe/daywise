# Festival traffic advisories

The travel-date field and guided itinerary show a non-blocking advisory when the destination's provider-confirmed city/country and local travel date match a reviewed calendar entry. Preview, accepted and reopened guided itineraries use their own departure date in the destination timezone. Editing the draft never changes the accepted itinerary's advisory.

This feature makes no requests to Google, Gemini or an event service. It does not generate or save a trip, change route order, add arbitrary travel minutes, modify prices, or claim a road is closed. Local congestion/diversion advice is a planning inference from possible celebrations, not a live traffic report. Continue to check current navigation and local traffic police notices before departure.

## Evidence and coverage

Calendar reviewed on **15 October 2026**:

- [Rajasthan Tourism 2024–2030 calendar](https://www.tourism.rajasthan.gov.in/content/dam/rajasthan-tourism/english/pdf/FairsandFestivals.pdf): Jaipur Gangaur/Teej 2026–2030, Udaipur Mewar 2026–2027, Jodhpur Marwar 2026–2027. Inclusive start/end dates are transcribed as published, with no extrapolation to unlisted years.
- [Rajasthan Tourism Jaipur page](https://www.tourism.rajasthan.gov.in/jaipur.html): Gangaur/Teej procession context around City Palace, Tripolia Bazaar and Chhoti Chaupar. This is not an annual traffic-closure notice.
- [Rajasthan Tourism Gangaur/Mewar description](https://www.tourism.rajasthan.gov.in/travel-diaries/itvaSthan.html): Udaipur procession/Lake Pichola context.
- [Rajasthan Tourism festivals page](https://www.tourism.rajasthan.gov.in/fairs-and-festivals.html): Marwar/Jodhpur venue context.
- [Government of India IIRS/ISRO 2026 holiday calendar](https://www.iirs.gov.in/holidaycalender): Holi, Ram Navami, Janmashtami, Dussehra, Diwali, Guru Nanak Jayanti and Christmas. Country-level notices say celebrations **may** affect nearby roads; impact varies by locality. No assumed extra days before/after a holiday and no guessed dates for moon-sighting observances.

Coverage is deliberately partial and visible in the collapsed **Festival coverage** note. No match does not mean traffic is clear. International cities receive no invented local festival dates. The shared-link payload does not carry a validated country/city identity, so this change does not infer festival warnings from a shared title, currency or private starting location.

## Updating the calendar

Edit `packages/domain/src/festival-calendar.ts` after checking a current official source. Each event needs a unique ID, country code, exact city aliases for local events, explicit ISO date ranges, source link and review date. Do not use substring matching, hardcoded coordinates, a lunar date repeated every year, or an AI-generated event date. Keep source date corrections in a reviewed change and add a date/boundary test. Event dates may change after publication; the UI links the calendar for confirmation.

The pure matcher is in `packages/domain/src/festival-traffic.ts`; the reusable display is `apps/web/src/components/TrafficAdvisory.tsx`. Unit tests cover scope, dates and timezone handling; browser tests cover draft date changes, explicit planning, accepted-trip isolation and mobile layout. There is no new API key or dependency.
