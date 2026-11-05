import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Felsökningshjälp i dev-läge (används även av skärmdumpsskript).
if (import.meta.env.DEV) {
  Promise.all([import('./state/useStore.js'), import('./nav/playerState.js')]).then(([s, p]) => {
    window.__gt = { useStore: s.useStore, player: p.player };
  });
}
