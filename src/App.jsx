import { useEffect, useState } from 'react';
import Experience from './scene/Experience.jsx';
import StartScreen from './ui/StartScreen.jsx';
import Hud from './ui/Hud.jsx';
import ProductPanel from './ui/ProductPanel.jsx';
import Wishlist from './ui/Wishlist.jsx';
import Cart from './ui/Cart.jsx';
import StaffChat from './ui/StaffChat.jsx';
import TryOn from './ui/TryOn.jsx';
import { useStore } from './state/useStore.js';
import { buildWorld } from './nav/world.js';
import { FIXTURES } from './config/fixtures.js';
import { loadProducts } from './data/products.js';
import Catalog from './ui/Catalog.jsx';
import { startMultiplayer } from './net/multiplayer.js';

const IS_CATALOG = window.location.pathname.replace(/\/$/, '') === '/katalog';

export default function App() {
  return IS_CATALOG ? <CatalogApp /> : <StoreApp />;
}

function CatalogApp() {
  useEffect(() => {
    document.title = 'Katalog – Gina Tricot';
    loadProducts().then((p) => useStore.getState().setProducts(p)).catch(() => {});
  }, []);
  return <Catalog />;
}

function StoreApp() {
  const entered = useStore((s) => s.entered);
  const hasPanel = useStore((s) => !!s.selectedId || s.wishlistOpen || s.cartOpen || s.chat.open);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (entered) startMultiplayer();
  }, [entered]);

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
          <StaffChat />
          <TryOn />
        </>
      ) : (
        <StartScreen ready={ready} />
      )}
    </div>
  );
}
