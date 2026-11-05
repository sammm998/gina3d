import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';

import { PATHS } from './config/storeConfig.js';

/**
 * data/media.json (skapas av importen) ersätter platshållarbilderna på skärmar
 * och tavlor med riktiga modellfoton: { campaign: [...], photos: [...] }.
 */
async function loadMedia() {
  try {
    const res = await fetch('/data/media.json', { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return;
    const m = await res.json();
    if (Array.isArray(m.campaign) && m.campaign.length) PATHS.campaign.splice(0, PATHS.campaign.length, ...m.campaign);
    if (Array.isArray(m.photos) && m.photos.length) PATHS.photos.splice(0, PATHS.photos.length, ...m.photos);
  } catch {
    /* inga riktiga foton – platshållarna används */
  }
}

loadMedia().finally(() =>
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);

// Felsökningshjälp i dev-läge (används även av skärmdumpsskript).
if (import.meta.env.DEV) {
  Promise.all([import('./state/useStore.js'), import('./nav/playerState.js')]).then(([s, p]) => {
    window.__gt = { useStore: s.useStore, player: p.player };
  });
}
