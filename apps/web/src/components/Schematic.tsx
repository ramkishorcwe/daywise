import { useState } from 'react';
import { Plus, Minus, LocateFixed, Map } from 'lucide-react';
import type { City, Plan, TripInput } from '../../../../packages/contracts/src';

export default function Schematic({ city, input, plan, selected, select }: { city: City; input: TripInput; plan: Plan; selected: string | null; select: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const visits = plan.stops.filter(s => s.kind !== 'break');
  const start = city.anchors.find(a => a.id === input.startAnchorId)!, end = city.anchors.find(a => a.id === input.endAnchorId)!;
  const path = [start.point, ...visits.map(s => s.point), end.point].map(p => `${p.x},${p.y}`).join(' ');
  return <section className="schematic-card" aria-label="Test route schematic">
    <div className="map-top"><span><Map size={14} /> Your day at a glance</span><span className="map-label">SCHEMATIC · TEST GRAPH</span></div>
    <svg viewBox="0 0 100 100" role="group" aria-label="Abstract stop diagram, not a street map or navigation route" preserveAspectRatio="xMidYMid meet">
      <defs><pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#dfe6dc" strokeWidth="0.5" /></pattern></defs>
      <rect width="100" height="100" fill="url(#grid)" /><path d="M0 52 Q30 35 54 52 T100 43" fill="none" stroke="#d0e4dd" strokeWidth="9" />
      <g transform={`translate(50 50) scale(${zoom}) translate(-50 -50)`}>
        <rect x="28" y="19" width="16" height="15" rx="4" fill="#e0e7cf" /><rect x="54" y="65" width="22" height="16" rx="5" fill="#e1e8d4" /><rect x="9" y="36" width="13" height="11" rx="3" fill="#ebe7da" />
        <polyline points={path} fill="none" stroke="#267d69" strokeWidth="0.8" strokeDasharray="1.6 1" />
        <circle cx={start.point.x} cy={start.point.y} r="3" fill="#fff" stroke="#267d69" strokeWidth="0.8" /><text x={start.point.x} y={start.point.y + 1} textAnchor="middle" fontSize="2.8" fontWeight="700" fill="#174c40">{start.id === end.id ? 'S/E' : 'S'}</text>
        {start.id !== end.id && <><circle cx={end.point.x} cy={end.point.y} r="3" fill="#fff" stroke="#267d69" strokeWidth="0.8" /><text x={end.point.x} y={end.point.y + 1} textAnchor="middle" fontSize="2.8" fill="#174c40">E</text></>}
        {visits.map((stop, index) => <g key={stop.id} role="button" tabIndex={0} aria-label={`Select ${stop.name}`} onClick={() => select(stop.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(stop.id); } }} className="map-marker"><circle cx={stop.point.x} cy={stop.point.y} r={selected === stop.id ? 4 : 3} fill={stop.kind === 'meal' ? '#bc794b' : '#267d69'} stroke="#fff" strokeWidth="0.8" /><text x={stop.point.x} y={stop.point.y + 1} textAnchor="middle" fontSize="2.8" fontWeight="700" fill="#fff">{index + 1}</text></g>)}
      </g>
    </svg>
    <div className="map-controls"><button className="icon-button" aria-label="Zoom schematic in" onClick={() => setZoom(z => Math.min(1.6, z + .2))}><Plus size={17} /></button><button className="icon-button" aria-label="Zoom schematic out" onClick={() => setZoom(z => Math.max(1, z - .2))}><Minus size={17} /></button><button className="icon-button" aria-label="Reset schematic zoom" onClick={() => setZoom(1)}><LocateFixed size={17} /></button></div>
    <div className="map-bottom"><span><i /> Planned visits</span><span><i className="meal" /> Meal break</span><span>S/E · start & return</span></div>
  </section>;
}
