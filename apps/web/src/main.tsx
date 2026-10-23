import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppRecovery from './components/AppRecovery';
import './fonts.css';
import './styles.css';
import './readability.css';
import './connections.css';
import './assistant.css';
import './day-view.css';
import './travel-theme.css';

const SharedTripPage = lazy(() => import('./components/SharedTripPage'));
createRoot(document.getElementById('root')!).render(<StrictMode><AppRecovery>{window.location.pathname.startsWith('/shared/') ? <Suspense fallback={<p>Opening shared itinerary…</p>}><SharedTripPage /></Suspense> : <App />}</AppRecovery></StrictMode>);
