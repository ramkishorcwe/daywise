import { useEffect, useRef, useState } from 'react';
import type { RouteEstimate } from '../../../../packages/contracts/src/api';
import type { Coordinate } from '../../../../packages/contracts/src/api';
import { coordinateSchema } from '../../../../packages/contracts/src/api';
import { googleKeyIsValid } from '../../../../packages/data-adapters/src/google-config';

import { loadMaps, subscribeMapFailures, mapAuthorizationFailed, authorizationMessage } from '../maps-sdk';
const noPoints: { name: string; coordinates: Coordinate }[] = [];
export default function ProviderMap({ route, points = noPoints, pick, activeIndex, onSelectStop, snapshot = false }: { route?: RouteEstimate; points?: { name: string; coordinates: Coordinate; price?: string }[]; pick?: (point: Coordinate) => void; activeIndex?: number; onSelectStop?: (index: number) => void; snapshot?: boolean }) {
  const root = useRef<HTMLDivElement>(null), mapRef = useRef<google.maps.Map | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [loading, setLoading] = useState(false);
  const visibleMarkers = useRef<Array<{ marker: google.maps.Marker; indices: number[] }>>([]), selection = useRef(onSelectStop); selection.current = onSelectStop;
  useEffect(() => { for (const row of visibleMarkers.current) { const selected = activeIndex !== undefined && row.indices.includes(activeIndex); row.marker.setAnimation?.(selected ? google.maps.Animation?.BOUNCE ?? null : null); if (selected) { const position = row.marker.getPosition?.(); if (position) mapRef.current?.panTo?.(position); } } }, [activeIndex, loading]);
  useEffect(() => { const failed = (message: string) => { setLoading(false); setError(message); }; return subscribeMapFailures(failed); }, []);
  useEffect(() => {
    let canceled = false; let line: google.maps.Polyline | null = null; const markers: google.maps.Marker[] = []; let click: google.maps.MapsEventListener | null = null;
    setError(''); setLoading(false);
    const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
    if (!key && !(typeof google !== 'undefined' && google.maps?.Map && google.maps.geometry?.encoding)) { setError('A restricted Google Maps browser key is needed to display the map. Set VITE_GOOGLE_MAPS_BROWSER_KEY in .env and restart the web server.'); return; }
    if (key && !googleKeyIsValid(key)) { setError('VITE_GOOGLE_MAPS_BROWSER_KEY must contain a valid Google API key value. Check .env and restart the web server.'); return; }
    if (route && !snapshot && Date.parse(route.expiresAt) <= Date.now()) { setError('This estimate expired. Request a fresh route.'); return; }
    if (!route && !points.length) { setError('Select a real destination or starting point before opening the map.'); return; }
    if (points.some(point => !coordinateSchema.safeParse(point.coordinates).success)) { setError('The selected map coordinates are invalid. Select the location again.'); return; }
    setLoading(true);
    loadMaps(key).then(() => {
      if (canceled || !root.current) return;
      if (mapAuthorizationFailed()) throw new Error(authorizationMessage);
      const path = route ? google.maps.geometry.encoding.decodePath(route.encodedPolyline) : points.map(point => new google.maps.LatLng(point.coordinates.latitude, point.coordinates.longitude));
      if (!path.length) throw new Error('The provider route geometry is empty.');
      const map = mapRef.current ?? (mapRef.current = new google.maps.Map(root.current, { center: path[0], zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative' }));
      if (route) line = new google.maps.Polyline({ path, map, strokeColor: '#246c5c', strokeWeight: 5 });
      const grouped = new Map<string, { coordinates: Coordinate; names: string[]; labels: string[] }>();
      points.forEach((point, index) => {
        const name = point.price ? `${point.name} · ${point.price}` : point.name;
        const key = `${point.coordinates.latitude},${point.coordinates.longitude}`, existing = grouped.get(key);
        if (existing) { if (!existing.names.includes(name)) existing.names.push(name); existing.labels.push(String(index + 1)); }
        else grouped.set(key, { coordinates: point.coordinates, names: [name], labels: [String(index + 1)] });
      });
      visibleMarkers.current = [];
      grouped.forEach(point => { const marker = new google.maps.Marker({ map, position: { lat: point.coordinates.latitude, lng: point.coordinates.longitude }, title: point.names.join(' / '), label: point.labels.join('/') }); markers.push(marker); const indices = point.labels.map(label => Number(label) - 1); visibleMarkers.current.push({ marker, indices }); if (selection.current) marker.addListener?.('click', () => selection.current?.(indices[0])); });
      if (path.length === 1 || (!route && grouped.size === 1)) { map.setCenter(path[0]); map.setZoom(12); } else { const bounds = new google.maps.LatLngBounds(); path.forEach(point => bounds.extend(point)); grouped.forEach(point => bounds.extend({ lat: point.coordinates.latitude, lng: point.coordinates.longitude })); map.fitBounds(bounds, 32); }
      if (pick) click = map.addListener('click', (event: google.maps.MapMouseEvent) => { if (event.latLng) pick({ latitude: event.latLng.lat(), longitude: event.latLng.lng() }); });
      setLoading(false);
    }).catch(failure => { if (!canceled) { setLoading(false); setError(failure instanceof Error ? failure.message : 'The map could not load. Retry.'); } });
    return () => { canceled = true; line?.setMap(null); markers.forEach(marker => marker.setMap(null)); visibleMarkers.current = []; click?.remove(); };
  }, [route, points, pick, retry, snapshot]);
  return <>{loading && <p role="status">Loading Google map…</p>}{error && <div className="error-box" role="alert">{error}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry map</button></div>}<div ref={root} className="provider-map" aria-busy={loading} style={error ? { display: 'none' } : undefined} aria-label={route ? 'Google driving route estimate' : 'Google location selection map'} /></>;
}
