import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@design/moch.css';
import './app.css';
import { App } from './App';
import { persistStorage } from './lib/idb';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  });
}

// Aufnahmen liegen bis zum Upload im Browser. Der Browser soll sie bei
// Speicherknappheit nicht wegräumen.
void persistStorage();
