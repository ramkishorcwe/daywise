import type { GuideComparison as Comparison, GuidePlanStyle } from '../../../../packages/contracts/src/guide';
import { formatTime } from '../../../../packages/domain/src/time-format';
import { priceRange } from '../trip-price';
import './guide-comparison.css';

export const planStyleLabels: Record<GuidePlanStyle, string> = {
  sightseeing: 'More sightseeing', less_travel: 'Less travelling', relaxed: 'Relaxed day',
};
const descriptions: Record<GuidePlanStyle, string> = {
  sightseeing: 'Prioritizes more matching visits within your limits.',
  less_travel: 'Prioritizes less travel, aiming for at least two visits when feasible.',
  relaxed: 'Prioritizes an earlier finish, with up to three visits unless your required stops need more.',
};
export default function GuideComparison({ comparison, selected, onSelect }: { comparison: Comparison; selected: GuidePlanStyle | null; onSelect: (style: GuidePlanStyle) => void }) {
  return <section className="guide-comparison" aria-label="Compare three plans">
    <h2>Three ways to spend your day</h2>
    <p>Same preferences, different priorities. Select a plan to review its route; only accepting it saves it.</p>
    <div className="guide-comparison-grid">{comparison.options.map(option => <article key={option.style} className={`guide-comparison-card ${selected === option.style ? 'is-selected' : ''}`} aria-label={planStyleLabels[option.style]}>
      <h3>{planStyleLabels[option.style]}</h3><p className="field-note">{descriptions[option.style]}</p>
      {option.status === 'unavailable' ? <p className="error-box" role="status">{option.reason}</p> : (() => {
        const { plan } = option, t = plan.itinerary, b = plan.budget;
        const visits = t.stops.filter((_, i) => !plan.stops[i].mealKind);
        const spare = Math.max(0, Math.floor((Date.parse(t.deadlineAt) - Date.parse(t.finishAt)) / 60000));
        const partial = b.unknowns.length > 0;
        return <>
          <dl><div><dt>Visits</dt><dd>{visits.length}{plan.stops.some(s => s.mealKind) ? ' + meal' : ''}</dd></div>
            <div><dt>Travel</dt><dd>{Math.ceil(t.route.durationSeconds / 60)} min · {(t.route.distanceMeters / 1000).toFixed(1)} km</dd></div>
            <div><dt>Return</dt><dd>{formatTime(Date.parse(t.finishAt), t.destination.timezone!)} · {spare} min before deadline</dd></div>
            <div><dt>{partial ? 'Known group subtotal' : 'Group estimate'}</dt><dd>{b.currency && (!partial || b.groupKnownMaximum > 0) ? priceRange(b.groupKnownMinimum, b.groupKnownMaximum, b.currency) : 'Not fully priced'}</dd></div></dl>
          {partial && <p className="field-note">Partial estimate; unpriced or unverified costs remain.</p>}
          <p className="guide-comparison-places">{visits.map(s => s.location.name).join(' → ')}</p>
          {option.sameAs && <p className="field-note">Same itinerary as {planStyleLabels[option.sameAs]} under these constraints.</p>}
          <button type="button" className={`button ${selected === option.style ? 'primary' : 'secondary'}`} aria-pressed={selected === option.style} onClick={() => onSelect(option.style)}>{selected === option.style ? `Reviewing ${planStyleLabels[option.style]}` : `Review ${planStyleLabels[option.style]}`}</button>
        </>;
      })()}
    </article>)}</div>
    <p className="field-note">Times use the destination timezone. Estimates come from the available shortlist and provider routes; these are not guaranteed globally optimal plans. Your visit durations, meal choice, locks and must-visits stay in effect.</p>
  </section>;
}
