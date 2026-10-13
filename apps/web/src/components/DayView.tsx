import { Check, Clock3, Flag, Footprints, MapPin, ShieldCheck } from 'lucide-react';
import type { TripSession } from '../../../../packages/contracts/src';
import { dayPosition } from '../../../../packages/domain/src/day-view';
import { getCity } from '../../../../fixtures/cities';
import { formatTime } from '../../../../packages/domain/src/time-format';
import { formatMoney, formatRange } from '../../../../packages/domain/src/money';
import { sameValue } from '../../../../packages/domain/src/versioning';

export default function DayView({ session, planner, assistant, another, local, finish }: { session: TripSession; planner: () => void; assistant: () => void; another: () => void; local: () => void; finish: () => void }) {
  const confirmed = session.confirmed;
  if (!confirmed) return <section className="empty-card"><ShieldCheck /><h2>Confirm your day first</h2><p>Review the itinerary and confirm it to follow your day here. Unaccepted drafts stay in the planner.</p><button className="button primary" onClick={planner}>Review my itinerary</button></section>;
  const city = getCity(confirmed.input.cityId)!;
  const { completedCount, completed, next, progress, returnRemaining } = dayPosition(confirmed, session.assistant);
  const anchor = completed.at(-1)?.name ?? city.anchors.find(value => value.id === confirmed.input.startAnchorId)?.name ?? 'Starting point';
  const endpoint = city.anchors.find(value => value.id === confirmed.input.endAnchorId)?.name ?? 'Return point';
  const completion = session.completion;
  const returnedAt = completion ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: city.timezone }).format(Date.parse(completion.arrivedAt)) : null;
  const unaccepted = !sameValue(session.input, confirmed.input) || (session.draftOrder !== null && !sameValue(session.draftOrder, confirmed.plan.order));
  return <section className="day-view" aria-label="Confirmed day overview">
    <div className="day-view-context"><span className="pill"><ShieldCheck size={14} />CONFIRMED VERSION</span><span>{city.name} · {confirmed.input.date} · {city.timezone}</span></div>
    <p className="muted">This view follows the day you accepted. Progress comes only from stops you report; there is no automatic location tracking.</p>
    {session.assistant?.tripId === null && !completion && <div className="notice" role="status">Progress stays on this device. Local day updates can review the remaining fixture schedule; backend updates are detached.</div>}
    {unaccepted && <div className="notice" role="status">Unaccepted edits stay in your planner. This view follows your confirmed plan.</div>}
    {completion ? <div className="notice" role="status">Return has been reported. Progress and accepted itinerary stay preserved; start a separate day for another plan.</div> : progress?.revision ? <div className="notice" role="status">Progress was reported. Remaining times are estimates from your accepted schedule; review a revision if the day has changed.</div> : <p className="field-note">No progress has been reported. Scheduled times do not automatically complete a stop.</p>}
    {confirmed.plan.catalogVersion !== city.catalogVersion && <div className="notice" role="status">This saved plan uses an older test catalog. Its accepted schedule is preserved; review a fresh day before relying on changed data.</div>}
    <div className="day-view-grid">
      {completion ? <article className="day-next"><span className="eyebrow">DAY REPORTED COMPLETE</span><h2>Returned to {endpoint}</h2><p className="day-anchor"><MapPin size={16} />{returnedAt} · {city.timezone}</p><p className="day-reason">Arrival was manually reported and has not been independently verified. No location was tracked. Estimates and reported expense amounts remain separate.</p><div className="day-controls"><button className="button secondary" onClick={finish}>Review return report</button><button className="button secondary" onClick={planner}>View itinerary</button></div></article> : <article className="day-next"><span className="eyebrow">{returnRemaining ? 'RETURN JOURNEY' : next?.kind === 'break' ? 'NEXT · REST BREAK' : next?.kind === 'meal' ? 'NEXT · MEAL' : 'NEXT STOP'}</span><h2>{next?.name ?? endpoint}</h2>
        <p className="day-anchor"><MapPin size={16} />{progress?.revision ? 'Last reported point' : 'Planned starting point'}: {anchor}</p>
        <dl className="day-facts"><div><dt>{returnRemaining ? 'Planned return' : 'Planned arrival'}</dt><dd>{formatTime(next?.arrivalMs ?? confirmed.plan.finishMs, city.timezone)}</dd></div>{next && <div><dt>Planned departure</dt><dd>{formatTime(next.departureMs, city.timezone)}</dd></div>}<div><dt>Travel estimate</dt><dd>{next?.incomingLeg.durationMinutes ?? confirmed.plan.returnLeg.durationMinutes} min</dd></div><div><dt>{returnRemaining ? 'Return travel estimate' : 'Stop cost estimate'}</dt><dd>{formatRange(next?.cost ?? confirmed.plan.returnLeg.cost, city)}</dd></div></dl>
        <p className="day-reason">{next?.reason ?? 'All itinerary stops are marked complete. The return journey remains; arrival at the endpoint has not been reported.'}</p>
        <div className="day-controls"><button className="button primary" onClick={assistant}><Clock3 size={16} />Report progress or a delay</button>{!session.assistant?.tripId && <button className="button secondary" onClick={local}>Local day updates</button>}{returnRemaining && !session.assistant?.tripId && <button className="button primary" onClick={finish}>Report return arrival</button>}<button className="button secondary" onClick={planner}>View itinerary</button></div>
        <p className="field-note">Travel, food and accessibility information is fictional test data. Street navigation is unavailable for these test places.</p>
      </article>}
      <article className="day-progress"><h3>Your day at a glance</h3><p><b>{completedCount} of {confirmed.plan.stops.length}</b> stops reported complete</p><progress aria-label="Reported completed stops" max={Math.max(1, confirmed.plan.stops.length)} value={completedCount} /><ol>{confirmed.plan.stops.map((stop, index) => <li key={stop.id} aria-current={index === completedCount ? 'step' : undefined}><span className={`day-step ${index < completedCount ? 'done' : ''}`}>{index < completedCount ? <Check size={13} /> : index + 1}</span><div><b>{stop.name}</b><small>{index < completedCount ? 'Reported complete' : index === completedCount ? 'Next in your accepted plan' : 'Upcoming'}</small></div></li>)}</ol>
        <div className="day-return"><Flag size={16} /><div><b>Return to {endpoint}</b><small>{completion ? `Reported ${returnedAt}` : `Planned ${formatTime(confirmed.plan.finishMs, city.timezone)} · return remains`}</small></div></div>
        <p className="day-budget">Upper whole-group estimate <b>{formatMoney(confirmed.plan.total[1], city)}</b></p><p className="field-note"><Footprints size={12} /> Includes meals, rest breaks and the return journey. Costs are estimates, not recorded actual spending.</p>
      </article>
    </div><div className="day-new"><p>Start a separate day when your preferences or destination need a fresh baseline.</p><button className="button secondary" onClick={another}>Plan another day</button></div>
  </section>;
}
