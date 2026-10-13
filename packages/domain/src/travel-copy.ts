import { budgetKeys, confirmedSchema, type City, type ConfirmedPlan } from '../../contracts/src';
import { formatMoney, formatRange } from './money';
import { formatTime } from './time-format';

const budgetNames = { tickets: 'Tickets & activities', food: 'Food & drinks', transport: 'Car transport', parking: 'Parking allowance', other: 'Other expenses', reserve: 'Contingency reserve' };
const kindNames = { visit: 'Visit', meal: 'Meal', break: 'Rest break' };
export function travelCopy(confirmed: ConfirmedPlan, city: City, includeBudget = false) {
  confirmedSchema.parse(confirmed);
  const { input, plan } = confirmed;
  if (input.cityId !== city.id || plan.cityId !== city.id || input.currency !== city.currency || plan.currency !== city.currency) throw new Error('The accepted day does not match this city or currency.');
  return {
    title: `A day in ${city.name}`, date: input.date, timezone: plan.timezone,
    source: `Software fixture ${plan.catalogVersion}`,
    stale: plan.catalogVersion !== city.catalogVersion,
    start: { name: city.anchors.find(anchor => anchor.id === input.startAnchorId)?.name ?? 'Saved starting point (label unavailable)', time: formatTime(plan.startMs, plan.timezone) },
    stops: plan.stops.map(stop => ({ name: stop.name, kind: kindNames[stop.kind], arrival: formatTime(stop.arrivalMs, plan.timezone), departure: formatTime(stop.departureMs, plan.timezone), duration: stop.durationMinutes, travel: stop.incomingLeg.durationMinutes, wait: stop.waitMinutes })),
    end: { name: city.anchors.find(anchor => anchor.id === input.endAnchorId)?.name ?? 'Saved return point (label unavailable)', time: formatTime(plan.finishMs, plan.timezone), travel: plan.returnLeg.durationMinutes },
    budget: includeBudget ? { total: formatRange(plan.total, city), limit: formatMoney(plan.budgetLimit, city), rows: budgetKeys.map(key => ({ name: budgetNames[key], value: formatRange(plan.budget[key], city) })) } : null,
  };
}
export type TravelCopy = ReturnType<typeof travelCopy>;

// Only static CSS is embedded. The downloaded document has no scripts, remote assets or links.
export const travelCopyStyle = `
.travel-copy-sheet{font-family:system-ui,sans-serif;background:white;color:#253c38;padding:28px;border:1px solid #dce5df;border-radius:10px;line-height:1.65;overflow-wrap:anywhere;max-width:800px;margin:0 auto}
.travel-copy-sheet *{box-sizing:border-box}.travel-copy-sheet h1{font-size:28px;line-height:1.3;letter-spacing:-.7px;margin:8px 0}.travel-copy-sheet h2{font-size:18px;margin:18px 0 12px}.travel-copy-sheet h3{font-size:16px;margin:4px 0}.travel-copy-sheet p{margin:8px 0;font-size:12px}.travel-copy-brand{font-size:15px;font-weight:750;color:#246e5b}.travel-copy-label{font-size:10px;letter-spacing:1px;color:#246e5b;text-transform:uppercase}.travel-copy-context{color:#586b63}.travel-copy-warning{background:#f7f0df;padding:12px;border-radius:6px;font-size:12px}.travel-copy-anchor{border-block:1px solid #dce5df;padding:12px 0;font-size:13px}.travel-copy-stops{list-style:none;padding:0;margin:16px 0;counter-reset:stops}.travel-copy-stops li{counter-increment:stops;position:relative;padding:0 0 16px 34px;margin-bottom:14px;border-bottom:1px solid #e5e9e1;break-inside:avoid}.travel-copy-stops li:before{content:counter(stops);position:absolute;top:22px;left:0;background:#e9f1e9;color:#246e5b;border-radius:50%;width:24px;height:24px;text-align:center;font-size:12px}.travel-copy-stops small{font-size:11px;color:#61766b}.travel-copy-times{font-weight:650}.travel-copy-budget dl{margin:12px 0}.travel-copy-budget dl>div{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid #e5e9e1;font-size:12px}.travel-copy-budget dt{max-width:55%}.travel-copy-budget dd{margin:0;text-align:right}.travel-copy-footnote{color:#61766b;border-top:1px solid #dce5df;padding-top:16px;margin-top:20px!important}
@media(max-width:440px){.travel-copy-sheet{padding:16px}.travel-copy-sheet h1{font-size:24px}}
@media print{.travel-copy-sheet{border:0;padding:0;max-width:none}.travel-copy-warning{border:1px solid #d3c4a1;background:white}.travel-copy-anchor,.travel-copy-budget{break-inside:avoid}}
`;
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function travelCopyHtml(copy: TravelCopy): string {
  const e = escape;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>${e(copy.title)} · Daywise travel copy</title><style>${travelCopyStyle}body{margin:0;padding:24px;background:#f8faf6}@media print{body{padding:0}@page{margin:15mm}}</style></head><body><main class="travel-copy-sheet">
    <div class="travel-copy-brand">daywise.</div><p class="travel-copy-label">READ-ONLY TRAVEL COPY · ACCEPTED SCHEDULE</p><h1>${e(copy.title)}</h1><p class="travel-copy-context">${e(copy.date)} · ${e(copy.timezone)}</p>
    <p class="travel-copy-warning">Fictional test itinerary. Venues, hours, prices and travel times are unverified software fixtures. This is a saved schedule, not navigation or a live update.</p>
    <p>Source: ${e(copy.source)}${copy.stale ? ' · Older test catalog; review a fresh day before relying on changed data.' : ''}</p>
    <div class="travel-copy-anchor"><b>Start ${e(copy.start.time)}</b> · ${e(copy.start.name)}</div>
    <ol class="travel-copy-stops">${copy.stops.map(stop => `<li><small>${e(stop.travel)} min travel · test estimate${stop.wait ? ` · ${e(stop.wait)} min planned wait` : ''}</small><h3>${e(stop.name)}</h3><p class="travel-copy-times">${e(stop.arrival)}–${e(stop.departure)} · ${e(stop.kind)}</p><p>${e(stop.duration)} min planned here</p></li>`).join('')}</ol>
    <div class="travel-copy-anchor"><b>Return ${e(copy.end.time)}</b> · ${e(copy.end.name)}<p>${e(copy.end.travel)} min return travel · test estimate</p></div>
    ${copy.budget ? `<section class="travel-copy-budget"><h2>Estimated whole-group budget</h2><p><b>${e(copy.budget.total)}</b> of ${e(copy.budget.limit)} available</p><dl>${copy.budget.rows.map(row => `<div><dt>${e(row.name)}</dt><dd>${e(row.value)}</dd></div>`).join('')}</dl><p>Fictional estimates, including reserve and return travel. Accommodation and reported booked/actual costs are excluded.</p></section>` : ''}
    <p class="travel-copy-footnote">A static copy of the accepted itinerary. Draft changes, reported progress, dietary/accessibility preferences, party ages and expense records are excluded. It does not certify suitability or current conditions. Copies do not receive later revisions.</p>
  </main></body></html>`;
}
