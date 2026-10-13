import { useState } from 'react';
import { ArrowRight, Bookmark, Download, Plus, Search, Trash2 } from 'lucide-react';
import type { TripSession } from '../../../../packages/contracts/src';
import { getCity } from '../../../../fixtures/cities';
import './saved-plans.css';

type DayStatus = 'draft' | 'confirmed' | 'progress' | 'returned';
type Sort = 'updated' | 'date_asc' | 'date_desc';
function dayStatus(day: TripSession): DayStatus {
  if (day.completion) return 'returned';
  if (!day.confirmed) return 'draft';
  return day.assistant?.baseId === day.confirmed.id && day.assistant.progress?.revision ? 'progress' : 'confirmed';
}
const statusLabels: Record<DayStatus, string> = { draft: 'DRAFT', confirmed: 'CONFIRMED + DRAFT', progress: 'PROGRESS REPORTED', returned: 'RETURN REPORTED' };
const cityLabel = (id: string) => getCity(id)?.name ?? `Unavailable city (${id})`;

export default function SavedPlans({ saved, loading, readError, refresh, open, reuse, copy, remove, backup, planner }: {
  saved: TripSession[]; loading: boolean; readError: string;
  refresh: () => void; open: (day: TripSession) => void; reuse: (day: TripSession) => void;
  copy: (day: TripSession) => void; remove: (id: string) => void; backup: () => void; planner: () => void;
}) {
  const [query, setQuery] = useState(''), [cityId, setCityId] = useState(''), [status, setStatus] = useState<DayStatus | ''>(''), [sort, setSort] = useState<Sort>('updated');
  const cityIds = [...new Set([...saved.map(day => day.input.cityId), ...(cityId ? [cityId] : [])])].sort((a, b) => cityLabel(a).localeCompare(cityLabel(b)));
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = saved.filter(day => {
    const text = `${day.title} ${cityLabel(day.input.cityId)} ${day.input.date}`.normalize('NFKC').toLowerCase();
    return (!cityId || day.input.cityId === cityId) && (!status || dayStatus(day) === status) && terms.every(term => text.includes(term));
  }).sort((a, b) => {
    // Travel dates stay as destination-local calendar dates, never UTC instants.
    const difference = sort === 'updated' ? (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) : sort === 'date_asc' ? a.input.date.localeCompare(b.input.date) : b.input.date.localeCompare(a.input.date);
    return difference || a.id.localeCompare(b.id);
  });
  const hasFilters = !!(query || cityId || status);
  function clearFilters() { setQuery(''); setCityId(''); setStatus(''); }

  return <div className="saved-plans-space">
    <div className="saved-tools"><p><b>Keep an editable copy.</b>Private backups restore as separate saved days.</p><button className="button secondary" onClick={backup}>Backup &amp; restore</button></div>
    <section className="saved-finder" aria-label="Find saved days">
      <label className="saved-search">Search saved days<span><Search size={17} aria-hidden="true" /><input type="search" maxLength={160} autoComplete="off" value={query} placeholder="Name, city or YYYY-MM-DD" onChange={event => setQuery(event.target.value)} /></span></label>
      <div className="saved-filter-row">
        <label>Saved city<select aria-label="Saved city" value={cityId} onChange={event => setCityId(event.target.value)}><option value="">All saved cities</option>{cityIds.map(id => <option key={id} value={id}>{cityLabel(id)}</option>)}</select></label>
        <label>Saved day status<select aria-label="Saved day status" value={status} onChange={event => setStatus(event.target.value as DayStatus | '')}><option value="">All statuses</option><option value="draft">Draft only</option><option value="confirmed">Confirmed, no progress</option><option value="progress">Progress reported</option><option value="returned">Return reported</option></select></label>
        <label>Sort saved days<select aria-label="Sort saved days" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="updated">Recently saved first</option><option value="date_asc">Travel date · earliest first</option><option value="date_desc">Travel date · latest first</option></select></label>
      </div>
      <div className="saved-results"><p role="status" aria-live="polite">{loading ? 'Loading saved days…' : `Showing ${filtered.length} of ${saved.length} saved days`}</p><div><button className="text-button" disabled={!hasFilters} onClick={clearFilters}>Clear filters</button><button className="text-button" disabled={loading} onClick={refresh}>Refresh saved days</button></div></div>
      <p className="field-note">Search and filters stay in this view only. Travel dates use each destination’s local calendar and the current draft preferences. Reported progress and returns are manual, unverified records.</p>
    </section>
    {readError && <div className="error-box" role="alert">{readError} {saved.length ? 'Previously loaded cards remain visible.' : 'The collection could not be loaded.'} Your active day is still available. Retry with Refresh saved days.</div>}
    <section className="saved-grid" aria-label="Saved day results">{filtered.map(item => {
      const catalog = getCity(item.input.cityId);
      return <article className="saved-card" key={item.id}><span className="pill pale">{statusLabels[dayStatus(item)]}</span><h2>{item.title}</h2><p className="saved-city">{cityLabel(item.input.cityId)}</p><p>{item.input.date} · {item.input.adults + item.input.childAges.length} travelers · {item.input.currency}</p><p className="field-note">{catalog?.timezone ?? 'Destination unavailable in this catalog'} · Fictional test data · saved on this device</p><div><button className="button secondary" onClick={() => open(item)}>Open plan <ArrowRight size={16} /></button><button className="text-button" aria-label={`Reuse ${item.title}`} disabled={!catalog} onClick={() => reuse(item)}><Plus size={15} />Reuse day</button><button className="text-button" aria-label={`Travel copy for ${item.title}`} disabled={!item.confirmed} onClick={() => copy(item)}><Download size={15} />Travel copy</button><button className="icon-button" aria-label={`Delete ${item.title}`} onClick={() => remove(item.id)}><Trash2 size={17} /></button></div></article>;
    })}</section>
    {!loading && !readError && !filtered.length && <div className="empty-card"><Bookmark /><h2>{saved.length ? 'No saved days match these filters' : 'No saved days yet'}</h2><p>{saved.length ? 'Your saved collection is unchanged. Try another search or clear the filters.' : 'Build a plan and save it here.'}</p><button className="button primary" onClick={saved.length ? clearFilters : planner}>{saved.length ? 'Show all saved days' : 'Back to planner'}</button></div>}
  </div>;
}
