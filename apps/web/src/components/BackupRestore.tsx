import { useEffect, useRef, useState } from 'react';
import { Download, Upload, LoaderCircle } from 'lucide-react';
import type { TripSession } from '../../../../packages/contracts/src';
import { backupByteLimit, type DayBackup } from '../../../../packages/contracts/src/backup';
import { encodeDayBackup, makeDayBackup, readDayBackup } from '../../../../packages/domain/src/backup';
import { cities, getCity } from '../../../../fixtures/cities';
import Dialog from './Dialog';
import './backup.css';

export default function BackupRestore({ current, close, restore }: { current: TripSession; close: () => void; restore: (backup: DayBackup) => Promise<void> }) {
  const [preview, setPreview] = useState<DayBackup | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const restoring = useRef(false);
  useEffect(() => () => { request.current++; }, []);
  async function choose(file?: File) {
    const ticket = ++request.current; setPreview(null); setError(''); setNotice(''); setFileName(file?.name.slice(0, 160) ?? '');
    if (!file) { setBusy(false); return; } setBusy(true);
    try {
      if (file.size > backupByteLimit) throw new Error('Choose a backup no larger than 1 MiB.');
      const text = await file.text(); const value = readDayBackup(text, cities);
      if (ticket === request.current) setPreview(value);
    } catch (failure) { if (ticket === request.current) setError(failure instanceof Error ? failure.message : 'The backup could not be read.'); }
    finally { if (ticket === request.current) setBusy(false); }
  }
  const candidate = preview?.session, city = candidate ? getCity(candidate.input.cityId)! : null;
  return <Dialog title="Keep a private backup" close={close} wide>
    <div className="backup-space">
      <p>A backup contains private preferences, ages, accepted and draft plans, and reported expenses. Keep the file private. It is not encrypted or account sync.</p>
      <section className="backup-section"><span className="eyebrow">BACK UP THE CURRENT DAY</span><h3>{current.title}</h3><p>{current.input.date} · {getCity(current.input.cityId)?.name ?? current.input.cityId} · {current.input.currency}</p><p className="field-note">This captures the day selected when you opened this panel, including changes still in memory. Backend credentials, workspace connections and conversations are excluded.</p>
        <button className="button secondary" disabled={busy} onClick={() => {
          setError(''); setNotice(''); try {
            const sourceCity = getCity(current.input.cityId); if (!sourceCity) throw new Error('This city is not supported by the current catalog.');
            const text = encodeDayBackup(makeDayBackup(current, sourceCity)); const file = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = `daywise-private-day-${current.input.date}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice('Private backup downloaded. It is a separate copy; deleting the saved day does not remove this file.');
          } catch (failure) { setError(failure instanceof Error ? failure.message : 'The backup could not be prepared. Your day is unchanged.'); }
        }}><Download size={16} />Download private backup</button>
      </section>
      <section className="backup-section"><span className="eyebrow">RESTORE AS A SEPARATE DAY</span><h3>Choose a private-day backup</h3><p>Preview the file before restoring. Existing days and your active draft stay unchanged. Travel copies and budget/backend exports are different formats.</p>
        <label className="backup-file">Private backup file<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} /></label><p className="field-note">One Daywise day per file · JSON · maximum 1 MiB. Unsupported cities, malformed records and connected backend workspaces are rejected.</p>
        {fileName && <p className="field-note">Selected file: {fileName}</p>}
        {busy && <p role="status"><LoaderCircle className="spin" size={15} /> Checking or saving the private backup…</p>}
        {candidate && <section className="backup-preview" aria-label="Backup preview"><h3>{candidate.title}</h3><dl><div><dt>City and day</dt><dd>{city!.name} · {candidate.input.date}</dd></div><div><dt>Currency and group</dt><dd>{candidate.input.currency} · {candidate.input.adults + candidate.input.childAges.length} travelers</dd></div><div><dt>Accepted schedule</dt><dd>{candidate.confirmed ? `${candidate.confirmed.plan.stops.length} stops · ${candidate.confirmed.input.date}` : 'No accepted plan · draft only'}</dd></div><div><dt>Reported expenses</dt><dd>{candidate.expenses?.records.length ?? 0} category records</dd></div><div><dt>Reported progress</dt><dd>{candidate.assistant?.progress?.completedCount ?? 0} stops · offline snapshot</dd></div></dl>
          <p className="field-note">Saved software fixtures; imported times and costs are not freshly verified. No new plan is accepted by restoring.</p>
          {candidate.confirmed && candidate.confirmed.plan.catalogVersion !== city!.catalogVersion && <p className="backup-warning" role="status">This accepted plan uses an older fixture catalog. Its snapshot is retained; review a fresh day before relying on changed data.</p>}
          {candidate.assistant && <p className="backup-warning">Completed stops and accepted revision times remain visible. The backend connection is detached; start a separate day for new assistant revisions.</p>}
          <button className="button primary" disabled={busy} onClick={async () => {
            if (restoring.current) return; restoring.current = true;
            const ticket = ++request.current; setBusy(true); setError(''); setNotice('');
            try { await restore(preview!); if (ticket === request.current) { setPreview(null); setFileName(''); setNotice('A restored copy was added to Saved plans. Open it there when you are ready. Your current day is unchanged.'); } }
            catch { if (ticket === request.current) setError('The restored copy could not be saved. Existing days and your active draft are unchanged. Check device storage and retry.'); }
            finally { restoring.current = false; if (ticket === request.current) setBusy(false); }
          }}><Upload size={16} />Restore as separate day</button>
        </section>}
      </section>
      {error && <div className="error-box" role="alert">{error}</div>}{notice && <p className="backup-notice" role="status">{notice}</p>}
    </div>
  </Dialog>;
}
