import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './fonts.css';
import './styles.css';
import './readability.css';
import './connections.css';
import './assistant.css';
import './day-view.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
