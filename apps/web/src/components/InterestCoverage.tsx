import type { GuidePlan } from '../../../../packages/contracts/src/guide';

export default function InterestCoverage({ plan, compact = false }: { plan: GuidePlan; compact?: boolean }) {
  const rows = plan.interestCoverage;
  if (!rows?.length) return null;
  const included = rows.filter(row => row.status === 'included'), missing = rows.filter(row => row.status === 'not_scheduled');
  const label = (text: string) => text.replaceAll('_', ' ');
  return <div className={`guide-interest-coverage ${compact ? 'is-compact' : ''}`} role="region" aria-label="Selected interest coverage">
    <p><b>Your interests: {included.length}/{rows.length} covered</b></p>
    {included.length > 0 && <p>Included: {included.map(row => label(row.interest)).join(' · ')}</p>}
    {missing.length > 0 && (compact ? <p className="field-note">Not scheduled: {missing.map(row => label(row.interest)).join(' · ')}. Select this plan for the reasons.</p> : <ul>{missing.map(row => <li key={row.interest}><b>{label(row.interest)}:</b> {row.reason ?? 'Not covered by this selected itinerary.'}</li>)}</ul>)}
    {!compact && rows.some(row => row.interest === 'nightlife') && <p className="field-note">Nightlife counts only for visits from 18:00 in the destination timezone. Actual venue opening hours still apply.</p>}
  </div>;
}
