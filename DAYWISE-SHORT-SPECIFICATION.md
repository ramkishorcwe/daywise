# Daywise — Short Project Specification

Presentation reference · current implementation, 22 October 2026.

**One-line introduction:** Daywise builds a personalized day-trip itinerary using real places, a precise starting point, available time, travel preferences and budget evidence.

**Live app:** https://daywise-henna.vercel.app/

## 1. User journey

1. Select **Destination city**: the city whose attractions you want to explore.
2. Select **Starting location**: your hotel, address, GPS position or confirmed map pin. Example: destination Jaipur, start your hotel in Jaipur. An outside-city start requires confirmation.
3. Enter the travel date, departure time, return deadline and preferences. Return to the same place, or choose a different return point.
4. Press **Plan my day**, **Compare three plans**, or open **Choose my places** and press **Optimize route**.
5. Review the schedule, route and prices; acknowledge unverified details; **accept the itinerary to save it**. Editing the form never automatically generates a plan or saves a draft.

## 2. Inputs and possible values

| Input | Supported choices / meaning |
| --- | --- |
| Location | Real city/address/hotel/landmark/airport/station suggestions. Typing alone is not a confirmed location. GPS runs only after a click. |
| Date and time | Departure within seven days; destination timezone; a required return deadline. |
| Travelers | 1–12 adults; child ages 0–17; maximum 12 travelers altogether. Solo means exactly one traveler. |
| Budget | Optional nonnegative group/per-person limits; currency required for monetary estimates. |
| Interests | Multi-select: history, forts, palaces, culture, temples, shopping, nature, gardens, museums, food, nightlife, hidden gems. Click again to deselect. |
| Pace / group | Relaxed, balanced, packed / unspecified, solo, couple, friends, family, seniors. |
| Environment / mobility | Any, indoor, outdoor / standard, limited, wheelchair; evidence-dependent matching. |
| Travel mode | Drive, walk or bicycle, subject to provider availability. |
| Food | Any food, vegetarian options, pure vegetarian kitchen, vegan, no onion, no garlic, no root vegetables. Preparation must be confirmed with the restaurant. |
| Admission category | Automatic from currency, Indian or foreign; user override available. Currency is not proof of nationality. |
| Meal | Default checked; lunch when the trip overlaps 13:00–14:00; no dinner. Price tier: automatic, budget, standard, premium. |
| Advanced options | Visit duration, preferred arrival, must-visit, position locks, rest time, arrival buffer, cost estimates, guide notes and configured AI on/off. |

## 3. Planning features and rules

- **Automatic guide:** Configured Gemini ranks real candidates and estimates visit allowances. Server rules validate schedules using Google data. Explicit local planning also uses real Google places/routes.
- **Interest coverage:** Prioritizes every selected interest where feasible; explains omissions. Up to five attractions, plus lunch. Nightlife starts from 18:00 destination time.
- **Three plans:** More sightseeing favors visit count; Less travelling favors lower travel time; Relaxed day extends generated allowances 25% and favors earlier completion. User durations stay fixed. Duplicate/infeasible alternatives are unavailable.
- **Choose my places:** Category/search page; up to five distinct places, each 10–240 minutes. City-area checks reject unrelated results. Optimization retains every chosen visit or reports why the schedule cannot fit.
- **Routing:** Checks visit sequences against travel time, available opening/budget evidence, buffers and return deadline; aims to reduce backtracking.
- **Lunch:** Nearby real restaurant, including its effect on the next stop. Adjustable defaults: 45 minutes, within 1.5 km of the previous visit, at most 15 extra travel minutes and 2 km extra route distance.

## 4. What the user sees

Two main tabs: **Plan a trip** for the form and preview, and **Saved trips** for accepted itineraries. **New trip** is a header button. Open a saved itinerary for its prices, map and visits; **Follow this trip** jumps to its manual progress controls.

- **Itinerary:** name, address, available image, arrival/departure, visit/travel/buffer durations and price.
- **Map:** whole journey, numbered stops, route distance/time and per-leg Google Maps navigation.
- **Prices:** group/per-person ranges for tickets, food and transport; unknowns stay visible.
- **Festival advisories:** city/date-related notices with sources where available, not confirmed closures. Advisory lookups may follow city/date edits; planning still requires a button press.
- **Saved trips:** accept multiple itineraries; **New trip** starts another draft. LocalStorage keeps IDs; the private database retrieves trips by ID. A device backup supports offline recovery. Delete trips individually; draft edits preserve accepted trips.
- **Share trip:** read-only page link through WhatsApp/copy/share; private endpoints excluded unless explicitly included. Snapshots expire after seven days; later edits do not update them.
- **Follow this trip:** manual completion/return reports after departure; no continuous tracking or GPS verification.

## 5. How prices work

**Group estimate = tickets + food + transport + applicable additional allowances.** Unknown costs stay unknown; partial totals are not complete quotes.

- Tickets: reviewed/published evidence or explicit estimates; supported Indian/foreign categories. Unverified child concessions are excluded.
- India meal allowance/person: budget **₹150–300**, standard **₹300–600**, premium **₹600–1,200**; not restaurant quotes.
- India driving transport/group for **d km**: **₹(300 + 15d) to ₹(500 + 25d)**, rounded up to ₹10. Example: 20 km → **₹600–1,000**. User fixed/per-km estimates can replace this planning assumption.
- Supported exchange-rate data converts currency where needed; missing prices are not fabricated.

## 6. Technical specification and safeguards

| Layer | Technology / responsibility |
| --- | --- |
| Frontend | React, TypeScript and Vite; responsive desktop/mobile interface. |
| Backend | Node.js and Fastify; validated requests, scheduling and provider integration. |
| Places and maps | Google Places (New), Geocoding, Time Zone, Routes and Maps JavaScript APIs. |
| AI | Server-configured Gemini for candidate priorities/allowances and optional grounded festival lookup. |
| Authentication / cloud | Firebase anonymous authentication and Firestore for hosted shared data, request guards and usage accounting. |
| Private storage / hosting | Firestore stores accepted trips; localStorage holds IDs; IndexedDB keeps a device backup. Vercel hosts frontend and API. |

Server secrets stay out of Git/browser code. The public Maps key is restricted. Validation, expiry, duplicate-request and stale-response guards protect selections. Errors never substitute fictional locations or default coordinates.

Current app-side daily allowances: **1,000 Google provider attempts; 100 AI attempts**, resetting at 00:00 UTC. Provider account quotas and billing are separate limits.

## 7. Presentation script and honest limits

**Say:** “Daywise combines real places with my starting point, time, interests and budget. I can compare plans or choose stops, review the route and costs, accept it, reopen it after refresh and share the itinerary page.”

**Demo:** locations → time/preferences → Plan or Compare → map/prices → Accept → refresh/Saved trips → Share. Show chosen-place optimization if time permits.

**Practical value:** discovery, preference coverage, route ordering, timing, costs and trip management in one workflow.

**Limits:** Bounded shortlists; estimated traffic/durations; incomplete pricing or venue evidence; external API/billing/quota dependence. No ticket/cab booking, guaranteed globally shortest route, nationality verification or automatic attendance tracking.

**Verification:** Automated tests cover planning, GPS, accepted-trip recovery, database ownership, multiple itineraries, ID-only references and deletion. See `accepted-itineraries.md` for the new storage flow.

**Run locally:** `npm ci`, then `npm run dev:api`; in a second terminal run `npm run dev`. Open http://127.0.0.1:5173/. Existing provider configuration is required for real lookups.
