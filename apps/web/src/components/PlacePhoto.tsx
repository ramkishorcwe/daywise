import { useEffect, useRef, useState } from 'react';
import { placePhotoSchema, type PlacePhoto as PhotoResponse } from '../../../../packages/contracts/src/place-photo';
import { postLocation } from '../location-api';

export function PlacePhoto({ placeId, name }: { placeId: string | null; name: string }) {
  const frame = useRef<HTMLElement>(null);
  const [image, setImage] = useState<PhotoResponse['photo']>(null), [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  useEffect(() => {
    const controller = new AbortController(); let started = false;
    setImage(null); setState(placeId ? 'loading' : 'unavailable');
    const load = async () => {
      if (started || !placeId) return;
      started = true;
      try {
        const value = placePhotoSchema.parse(await postLocation('/guide/photo', { placeId }, controller.signal));
        if (!controller.signal.aborted) { setImage(value.photo); setState(value.photo ? 'ready' : 'unavailable'); }
      } catch { if (!controller.signal.aborted) setState('unavailable'); }
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); } }, { rootMargin: '200px' });
    if (frame.current && placeId) observer.observe(frame.current);
    return () => { observer.disconnect(); controller.abort(); };
  }, [placeId]);
  return <figure className="guide-place-photo" ref={frame} aria-label={`Photo of ${name}`}>
    {state === 'ready' && image ? <><img src={image.uri} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setState('unavailable')} /><figcaption>Google Maps{image.authors.map((author, index) => <span key={index}> · {author.uri ? <a href={author.uri} target="_blank" rel="noopener noreferrer">{author.name}</a> : author.name}</span>)}</figcaption></> : <span className="guide-photo-status">{state === 'loading' ? 'Loading photo…' : 'Photo unavailable'}</span>}
  </figure>;
}
