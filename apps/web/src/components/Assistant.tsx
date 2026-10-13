import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Send, ShieldCheck, Sparkles } from 'lucide-react';
import type { ConfirmedPlan, TripSession } from '../../../../packages/contracts/src';
import type { AssistantReply, Proposal } from '../../../../packages/contracts/src/assistant';
import type { RemoteTrip } from '../../../../packages/contracts/src/api';
import { sameValue } from '../../../../packages/domain/src/versioning';
import { formatMoney } from '../../../../packages/domain/src/money';
import { formatTime } from '../../../../packages/domain/src/time-format';
import { getCity } from '../../../../fixtures/cities';
import { assistantTurn, connectBackend, confirmRemoteTrip, decideProposal, generateRemoteTrip, getRemoteTrip, reportProgress, saveRemoteInput, setRemoteOrder } from '../api';
import Dialog from './Dialog';

export default function Assistant({ confirmed, workspace, finished, close, connected, context, apply }: {
  confirmed: ConfirmedPlan | null; workspace?: TripSession['assistant']; finished?: boolean; close: () => void; connected: () => void;
  context: (trip: RemoteTrip, baseId: string) => void; apply: (snapshot: ConfirmedPlan, baseId: string) => boolean;
}) {
  const [trip, setTrip] = useState<RemoteTrip | null>(null), [mode, setMode] = useState<'local' | 'openai' | 'gemini'>('local');
  const [message, setMessage] = useState(''), [conversation, setConversation] = useState<Array<{ from: 'you' | 'assistant'; text: string }>>([]);
  const [reply, setReply] = useState<AssistantReply | null>(null), [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [completedCount, setCompletedCount] = useState(0), [delay, setDelay] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [conversation]);
  async function run(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await work(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }
  function remember(value: RemoteTrip, baseId = confirmed!.id) { setTrip(value); setCompletedCount(value.progress?.completedCount ?? 0); context(value, baseId); }
  useEffect(() => {
    if (finished) { setError('Return has been reported. This accepted day and progress stay preserved; start a separate day for new assistant revisions.'); return; }
    if (!workspace || !confirmed) return;
    if (workspace.baseId !== confirmed.id) { setError('Saved progress belongs to a different confirmation. This accepted plan is preserved; start a separate day to create a new baseline.'); return; }
    if (workspace.tripId === null) { setError('This day keeps local reported progress. No backend connection is attached. Use Local day updates in Follow my day to review the remaining day, or start a separate day for backend assistant revisions. Your accepted schedule and progress stay preserved.'); return; }
    const tripId = workspace.tripId;
    let active = true; setBusy(true);
    connectBackend().then(async status => {
      const value = await getRemoteTrip(tripId);
      if (!value.confirmed || !sameValue(value.confirmed.plan, confirmed.plan) || !sameValue(value.confirmed.input, confirmed.input)) throw new Error('The backend confirmation differs from this browser. It cannot silently replace your accepted day.');
      if (workspace.progress?.revision && (!value.progress || value.progress.revision < workspace.progress.revision || value.progress.completedCount < workspace.progress.completedCount || Date.parse(value.progress.readyAt) < Date.parse(workspace.progress.readyAt))) throw new Error('Backend progress is older than your saved report. It cannot undo completed stops.');
      if (active) { connected(); setMode(status.assistantMode ?? 'local'); remember(value); }
    }).catch(failure => { if (active) setError(`Saved assistant workspace unavailable. ${failure.message} Your confirmed plan is preserved.`); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function start() {
    if (!confirmed) return;
    const status = await connectBackend(); connected(); setMode(status.assistantMode ?? 'local');
    let value = await saveRemoteInput(confirmed.input); value = await setRemoteOrder(value, confirmed.plan.order);
    const generated = await generateRemoteTrip(value);
    if (generated.result.outcome !== 'feasible' || !generated.candidate || !sameValue(generated.result.plan, confirmed.plan)) throw new Error('The baseline no longer matches the current fixture schedule. Replan and confirm a fresh day before continuing.');
    value = await confirmRemoteTrip(value, generated.candidate.id); remember(value);
    setConversation([{ from: 'assistant', text: 'Your accepted day is the baseline. Ask about its budget or food evidence, or request one change. Local mode uses supported commands; all travel facts are fixtures.' }]);
  }
  async function send(text: string) {
    if (!trip) return;
    setMessage(''); setProposal(null); setConversation(previous => [...previous, { from: 'you' as const, text }].slice(-20));
    const response = await assistantTurn(trip, text); remember(response.trip); setReply(response.reply); setMode(response.reply.mode); setProposal(response.reply.proposal);
    setConversation(previous => [...previous, { from: 'assistant' as const, text: response.reply.message }].slice(-20));
  }
  function submit(event: FormEvent) { event.preventDefault(); const text = message.trim(); if (text) void run(() => send(text)); }
  const city = trip ? getCity(trip.input.cityId)! : confirmed ? getCity(confirmed.input.cityId)! : null;
  return <Dialog title="A little help for your day" close={close} wide>
    <div className="assistant-mode"><Sparkles size={17} /><b>{mode === 'local' ? 'Local assistant · AI not connected' : 'OpenAI interpretation · planner-checked actions'}</b><span className="pill pale">TEST DATA</span></div>
    <p className="field-note">No live traffic, closures or real dietary verification is connected. The assistant can propose changes; you accept them.</p>
    {error && <div role="alert" className="error-box">{error}</div>}
    {!confirmed ? <section className="empty-card"><ShieldCheck /><h3>Confirm a baseline first</h3><p>Review and confirm your itinerary, then return here to test updates.</p></section> : !trip ? <section className="connection-card"><h3>{workspace?.tripId === null ? 'Day stays on this device' : 'Keep your accepted day as the baseline'}</h3><p>{workspace?.tripId === null ? 'Your progress and accepted times stay intact. Use Local day updates for remaining-day choices, or start a separate day for backend proposals.' : 'Your confirmed fixture itinerary will be copied into a private backend workspace. Future revisions require review and acceptance.'}</p><button disabled={busy || !!workspace} className="button primary" onClick={() => void run(start)}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Use my confirmed plan</button></section> : <>
      <section className="assistant-progress"><h3>Report where you are</h3><p className="field-note">Completed stops stay fixed. Delay here is total lateness at the selected anchor. Chat requests such as “delay 30 minutes” add an additional delay.</p><div className="form-grid"><label>Completed stops<select aria-label="Completed stops" value={completedCount} disabled={busy} onChange={event => setCompletedCount(Number(event.target.value))}><option value="0" disabled={(trip.progress?.completedCount ?? 0) > 0}>Not started · at starting point</option>{trip.confirmed!.plan.stops.map((stop, index) => <option key={stop.id} value={index + 1} disabled={index + 1 < (trip.progress?.completedCount ?? 0)}>Through {stop.name}</option>)}</select></label><label>Lateness at this point (minutes)<input aria-label="Lateness at this point (minutes)" type="number" min="0" max="180" step="1" value={delay} disabled={busy} onChange={event => setDelay(event.target.valueAsNumber)} /></label></div><button className="button secondary" disabled={busy || !Number.isInteger(delay)} onClick={() => void run(async () => { const value = await reportProgress(trip, completedCount, delay); remember(value); setProposal(null); setConversation(previous => [...previous, { from: 'assistant', text: 'Progress recorded. Existing confirmation is preserved; its remaining estimates may be outdated. Request a revision to review new times.' }]); })}>Record progress</button>{trip.progress && <p className="field-note">Progress revision {trip.progress.revision} · ready at {formatTime(Date.parse(trip.progress.readyAt), city!.timezone)} {city!.timezone}. Rejected proposals do not undo this report.</p>}</section>
      <div ref={log} className="assistant-conversation" role="log" aria-live="polite" aria-label="Planning conversation">{conversation.map((item, index) => <div key={index} className={`assistant-message ${item.from}`}><small>{item.from === 'you' ? 'YOU' : 'PLANNING ASSISTANT'}</small><p>{item.text}</p></div>)}</div>
      <div className="assistant-prompts">{['Summarize my plan', 'Show Jain food evidence', 'Delay 30 minutes', 'Use relaxed pace'].map(text => <button className="pill" disabled={busy} key={text} onClick={() => void run(() => send(text))}>{text}</button>)}</div>
      <form className="assistant-compose" onSubmit={submit}><label className="sr-only" htmlFor="assistant-message">Message the planning assistant</label><textarea id="assistant-message" value={message} maxLength={2000} disabled={busy} placeholder="Ask about your day or request one change…" onChange={event => setMessage(event.target.value)} /><button className="button primary" disabled={busy || !message.trim()} type="submit" aria-label="Send assistant message">{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}</button></form>
      {!!reply?.food.length && <section className="food-evidence"><h3>Food evidence</h3>{reply.food.map(place => <article key={place.id}><div><b>{place.name}</b><span className="pill pale">{place.matches ? 'Fixture match' : 'Evidence incomplete'}</span></div><ul>{place.rules.map(rule => <li key={rule.rule}><span>{rule.rule}</span><b>{rule.status.replace('_', ' ')}</b></li>)}</ul><small>Source: software fixture · real checking date: unavailable</small></article>)}</section>}
      {proposal && <section className="assistant-proposal"><div className="connection-heading"><ShieldCheck size={20} /><h3>Review this revision</h3></div><ul>{proposal.changes.map(change => <li key={change}>{change}</li>)}</ul><p><b>Return {formatTime(proposal.plan.finishMs, city!.timezone)} · upper group estimate {formatMoney(proposal.plan.total[1], city!)}</b></p><ol>{proposal.plan.stops.map(stop => <li key={stop.id}>{formatTime(stop.arrivalMs, city!.timezone)} · {stop.name}{proposal.plan.stops.indexOf(stop) < (trip.progress?.completedCount ?? 0) ? ' · completed, retained' : ''}</li>)}</ol><p className="field-note">Fixture source {proposal.catalogVersion} · review expires {new Date(proposal.expiresAt).toLocaleTimeString()}. The existing plan remains confirmed until acceptance.</p><div className="button-row"><button disabled={busy} className="button secondary" onClick={() => void run(async () => { remember(await decideProposal(trip, proposal, false)); setProposal(null); setConversation(previous => [...previous, { from: 'assistant', text: 'Proposal rejected. Confirmation is unchanged; recorded progress remains and estimates may be outdated.' }]); })}>Keep confirmed plan</button><button disabled={busy} className="button primary" onClick={() => void run(async () => { const value = await decideProposal(trip, proposal, true); if (!apply(value.confirmed!, confirmed.id)) throw new Error('Your browser baseline changed. Reopen the assistant to review the latest plan.'); remember(value, value.confirmed!.id); setProposal(null); setConversation(previous => [...previous, { from: 'assistant', text: 'Revision accepted and saved. Future changes still require review.' }]); })}><Check size={16} />Accept revision</button></div></section>}
    </>}
  </Dialog>;
}
