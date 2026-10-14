import { lazy, Suspense, useMemo } from 'react';
import type { GuidePlan } from '../../../../packages/contracts/src/guide';
import { journeyLinks } from '../journey-links';
import { mapStopPrice } from '../stop-price';
const ProviderMap = lazy(() => import('./ProviderMap'));
export default function JourneyMap({ plan, privatePoints = true, activeIndex, onHighlight }: { plan: GuidePlan; privatePoints?: boolean; activeIndex?: number; onHighlight?: (index: number) => void }) {
  const trip = plan.itinerary, links = useMemo(() => journeyLinks(trip, privatePoints), [trip, privatePoints]);
  const points = useMemo(() => links.points.map((p, i) => { const detail = plan.stops[privatePoints ? i - 1 : i]; return { name: p.name, coordinates: p.coordinates, ...(detail ? { price: mapStopPrice(detail, plan.budget.breakdown?.people) } : {}) }; }), [links, plan, privatePoints]);
  return <section className="journey-map" aria-label={privatePoints ? 'Whole journey map' : 'Shared visit map'}><h3>{privatePoints ? 'Your whole journey' : 'Your shared visit route'}</h3>
    <p>{(trip.route.distanceMeters / 1000).toFixed(1)} km planned travel · {Math.ceil(trip.route.durationSeconds / 60)} min · {trip.route.mode.toLowerCase()}</p>
    {!privatePoints && <p>Start and return points are hidden in this preview. Include them above to share the full journey.</p>}
    <Suspense fallback={<p role="status">Loading journey map…</p>}><ProviderMap snapshot route={privatePoints ? trip.route : undefined} points={points} activeIndex={activeIndex === undefined ? undefined : privatePoints ? activeIndex : activeIndex - 1} onSelectStop={onHighlight ? index => onHighlight(privatePoints ? index : index + 1) : undefined} /></Suspense>
    <ol className="journey-stops">{links.points.map((p, i) => <li key={`${p.id}:${i}`}><button type="button" className="text-button" onClick={() => onHighlight?.(privatePoints ? i : i + 1)}>{i + 1}. {privatePoints && i === 0 ? 'Start · ' : privatePoints && i === links.points.length - 1 ? 'Return · ' : ''}{p.name}</button></li>)}</ol>
    <div className="button-row"><a className="button secondary" href={links.overview} target="_blank" rel="noopener noreferrer">{privatePoints ? 'Open whole journey in Google Maps' : 'Open visit route in Google Maps'}</a></div>
    {!!links.sections.length && <><p>On mobile, open these sections in order to include every stop:</p><div className="button-row">{links.sections.map((s, i) => <a className="button secondary" key={i} href={s.url} target="_blank" rel="noopener noreferrer">Map section {i + 1}</a>)}</div></>}
    <p className="field-note">{privatePoints ? 'The map shows your saved Google route.' : 'The preview shows the selected visit pins; the route links connect them in itinerary order.'} Google Maps recalculates directions when opened; travel times may change.</p>
  </section>;
}
