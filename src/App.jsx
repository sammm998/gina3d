import { useEffect, useState } from 'react';
import Experience from './scene/Experience.jsx';
import StartScreen from './ui/StartScreen.jsx';
import Hud from './ui/Hud.jsx';
import ProductPanel from './ui/ProductPanel.jsx';
import Wishlist from './ui/Wishlist.jsx';
import Cart from './ui/Cart.jsx';
import TryOn from './ui/TryOn.jsx';
import { useStore } from './state/useStore.js';
import { buildWorld } from './nav/world.js';
import { FIXTURES } from './config/fixtures.js';
import { loadProducts } from './data/products.js';

export default function App() {
  const entered = useStore((s) => s.entered);
  const hasPanel = useStore((s) => !!s.selectedId || s.wishlistOpen || s.cartOpen);
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
    <div className={`app ${entered ? 'is-entered' : ''} ${hasPanel ? 'has-panel' : ''}`}>
      <Experience />
      {entered ? (
        <>
          <Hud />
          <ProductPanel />
          <Wishlist />
          <Cart />
          <TryOn />
        </>
      ) : (
        <StartScreen ready={ready} />
      )}
    </div>
  );
}
