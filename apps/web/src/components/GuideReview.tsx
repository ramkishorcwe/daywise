import { StopPrice } from './StopPrice';
import { PlacePhoto } from './PlacePhoto';
import TrafficAdvisory from './TrafficAdvisory';
import InterestCoverage from './InterestCoverage';
import '../guide.css';
import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import { formatTime, localDate } from '../../../../packages/domain/src/time-format';
import { mapsNavigation } from '../maps-navigation';
const money = (minimum: number, maximum: number, currency: string | null) => currency ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(minimum)}–${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(maximum)} ${currency}` : 'Currency not selected';
export function GuideReview({ plan, activeIndex, onHighlight }: { plan: GuidePlan; activeIndex?: number; onHighlight?: (index: number) => void }) {
  const t = plan.itinerary, time = (date: string) => formatTime(Date.parse(date), t.destination.timezone!);
  return <section className="guide-review" aria-label="Guided itinerary review"><span className="eyebrow">{plan.orderMode === 'manual' ? 'YOUR MANUALLY EDITED DAY' : 'GUIDE SUGGESTION · REVIEW BEFORE ACCEPTING'}</span><h2>Review your day in {t.destination.name}</h2>
    <p>{new Intl.DateTimeFormat('en', { timeZone: t.destination.timezone, dateStyle: 'long' }).format(new Date(t.route.departureTime))} · {t.destination.timezone} · {t.route.mode.toLowerCase()}</p>
    <TrafficAdvisory destination={t.destination} date={localDate(Date.parse(t.route.departureTime), t.destination.timezone!)} />
    <p>Start: {t.start.address ?? t.start.name}<br />Return: {t.end.address ?? t.end.name} · {time(t.finishAt)} (deadline {time(t.deadlineAt)})</p>
    <InterestCoverage plan={plan} />
    <div className="guide-summary"><span><b>{plan.stops.filter(s => !s.mealKind).length}</b> visits</span>{plan.stops.some(s => s.mealKind) && <span><b>{plan.stops.filter(s => s.mealKind).length}</b> meals</span>}<span><b>{(t.route.distanceMeters / 1000).toFixed(1)} km</b> travel</span><span><b>{Math.ceil(t.route.durationSeconds / 60)} min</b> travel</span><span><b>{t.stops.reduce((n, s, i) => n + (plan.stops[i].mealKind ? 0 : s.durationMinutes), 0)} min</b> sightseeing</span>{plan.stops.some(s => s.mealKind) && <span><b>{t.stops.reduce((n, s, i) => n + (plan.stops[i].mealKind ? s.durationMinutes : 0), 0)} min</b> eating</span>}</div>
    <ol className="guide-timeline">{t.stops.map((stop, index) => { const detail = plan.stops[index]; return <li key={stop.location.id} className={activeIndex === index + 1 ? 'guide-highlight' : ''}>
      <div className="guide-stop-card"><div className="guide-stop-content">
        <button type="button" className="text-button guide-stop-title" onClick={() => onHighlight?.(index + 1)} aria-label={`Highlight ${stop.location.name} on map`}><b>{index + 1}. {detail.mealKind ? 'Meal · ' : ''}{stop.location.name}</b></button>
        <p className="guide-stop-address">{stop.location.address}</p>
        <p className="guide-stop-time"><b>{time(stop.arrivalAt)}–{time(stop.departureAt)}</b> · {stop.durationMinutes} min {detail.mealKind ? 'meal' : 'visit'} · {Math.ceil(detail.travelMinutes)} min from previous stop · {detail.bufferMinutes} min arrival buffer{detail.waitingMinutes > 0 && ` · ${Math.ceil(detail.waitingMinutes)} min waiting`}</p>
        <StopPrice detail={detail} people={plan.budget.breakdown?.people} compact />
        <a href={mapsNavigation(index ? t.stops[index - 1].location : t.start, stop.location, t.route.mode)} target="_blank" rel="noopener noreferrer">Navigate this leg in Google Maps</a>
        {plan.breaks.filter(b => b.afterLocationId === stop.location.id).map((b, i) => <p className="guide-break" key={i}><b>{time(b.starts)}–{time(b.ends)} · {b.kind === 'meal' ? 'Meal' : 'Rest'} break</b></p>)}
      </div><PlacePhoto placeId={stop.location.placeId} name={stop.location.name} /></div>
    </li>; })}<li><b>{time(t.finishAt)} · Return to {t.end.name}</b><p>{t.end.address}</p><a href={mapsNavigation(t.stops.at(-1)!.location, t.end, t.route.mode)} target="_blank" rel="noopener noreferrer">Navigate return in Google Maps</a></li></ol>
    <details className="guide-planning-details"><summary>Planning details and cost notes</summary>
    <p>{plan.orderMode === 'manual' ? 'Your order was preserved. Use Optimize route to request a new sequence.' : `${plan.comparison.evaluatedSequences} candidate-order checks using Google travel times.`}{plan.comparison.originalTravelMinutes !== null && ` Input shortlist matrix estimate: ${Math.ceil(plan.comparison.originalTravelMinutes)} min travel (may include omitted places); selected route: ${Math.ceil(plan.comparison.selectedTravelMinutes)} min. Detours may be needed for openings, must-visits or return requirements.`}</p>
    <div className="guide-budget"><h3>Available cost estimates</h3><p>Group subtotal: <b>{money(plan.budget.groupKnownMinimum, plan.budget.groupKnownMaximum, plan.budget.currency)}</b><br />Per-person subtotal: <b>{money(plan.budget.perPersonKnownMinimum, plan.budget.perPersonKnownMaximum, plan.budget.currency)}</b>{plan.budget.groupLimit !== null && <><br />Group limit: {plan.budget.groupLimit} {plan.budget.currency}</>}</p>
      <p>{plan.budget.status === 'unknown' ? 'Full cost is unknown. This plan does not claim to fit the budget.' : plan.budget.status === 'over' ? 'These estimates exceed the budget.' : 'Within the supplied estimates; actual spending is not guaranteed.'}</p><ul>{plan.budget.unknowns.map(value => <li key={value}>{value}</li>)}</ul></div>
    <h3>Assumptions and information to confirm</h3><ul>{[...plan.assumptions, ...t.warnings].map((a, i) => <li key={i}>{a}</li>)}</ul>{plan.excluded.length > 0 && <p>{plan.excluded.length} optional place(s) omitted to keep this day feasible. They remain available in your candidate list.</p>}</details><div className="google-attribution" translate="no">Google Maps</div>
  </section>;
}
