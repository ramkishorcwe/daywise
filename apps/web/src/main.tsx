import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './fonts.css';
import './styles.css';
import './readability.css';
import './connections.css';
import './assistant.css';
import './day-view.css';

const SharedTripPage = lazy(() => import('./components/SharedTripPage'));
createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname.startsWith('/shared/') ? <Suspense fallback={<p>Opening shared itinerary…</p>}><SharedTripPage /></Suspense> : <App />}</StrictMode>);
