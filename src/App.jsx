import { useEffect, useState } from 'react';
import Experience from './scene/Experience.jsx';
import StartScreen from './ui/StartScreen.jsx';
import Hud from './ui/Hud.jsx';
import { useStore } from './state/useStore.js';
import { buildWorld } from './nav/world.js';
import { FIXTURES } from './config/fixtures.js';
import { loadProducts } from './data/products.js';

export default function App() {
  const entered = useStore((s) => s.entered);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    buildWorld(FIXTURES);
    loadProducts()
      .then((p) => useStore.getState().setProducts(p))
      .catch((err) => {
        console.error(err);
        useStore.getState().setProductsError(String(err.message || err));
      })
      .finally(() => setReady(true));
  }, []);

  return (
    <div className={`app ${entered ? 'is-entered' : ''}`}>
      <Experience />
      {entered ? <Hud /> : <StartScreen ready={ready} />}
    </div>
  );
}
