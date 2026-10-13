import { lazy, Suspense } from 'react';
import LiveApp from './LiveApp';
const FixtureApp = import.meta.env.DEV && import.meta.env.VITE_ENABLE_FIXTURE_UI === 'true' && new URLSearchParams(location.search).get('live') !== '1' ? lazy(() => import('./FixtureApp')) : null;
export default function App() { return FixtureApp ? <Suspense fallback={<p>Opening isolated fixture tests…</p>}><FixtureApp /></Suspense> : <LiveApp />; }
