import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import Logo from './Logo.jsx';
import Minimap from './Minimap.jsx';
import Joystick from './Joystick.jsx';
import Tooltip from './Tooltip.jsx';
import { startTour, stopTour, useTourController } from './Tour.js';

function Icon({ name }) {
  const paths = {
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
    play: 'M8 5v14l11-7z',
    stop: 'M7 7h10v10H7z',
    mouse: 'M12 3a5 5 0 0 0-5 5v8a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5zm0 0v5',
    bag: 'M5 8h14l-1 12H6L5 8zm4 0V6a3 3 0 0 1 6 0v2',
    chat: 'M4 5h16v11H9l-5 4V5z',
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(id);
  }, [toast]);
  return <div className={`toast ${visible ? 'is-visible' : ''}`} role="status">{toast?.text}</div>;
}

export default function Hud() {
  useTourController();
  const isTouch = useStore((s) => s.isTouch);
  const locked = useStore((s) => s.pointerLocked);
  const tour = useStore((s) => s.tour);
  const wishCount = useStore((s) => s.wishlist.length);
  const setWishlistOpen = useStore((s) => s.setWishlistOpen);
  const cartCount = useStore((s) => s.cart.length);
  const setCartOpen = useStore((s) => s.setCartOpen);
  const arrived = useStore((s) => s.arrivedNavId);
  const fittingNavId = useStore((s) => s.fittingNavId);
  // framme i provrummet → öppna provningen med kundkorgens plagg
  useEffect(() => {
    if (fittingNavId && arrived === fittingNavId) {
      useStore.setState({ fittingNavId: 0 });
      useStore.getState().openTryOn(null, true);
    }
  }, [arrived, fittingNavId]);
  const [mapOpen, setMapOpen] = useState(() => window.innerWidth > 900);

  return (
    <div className={`hud ${locked ? 'is-locked' : ''}`}>
      <header className="hud__top">
        <Logo className="hud__logo" />
        <div className="hud__actions">
          <button className="btn btn--ghost" onClick={() => (tour.active ? stopTour() : startTour())}>
            <Icon name={tour.active ? 'stop' : 'play'} />
            <span>{tour.active ? t('hud.stopTour') : t('hud.tour')}</span>
          </button>
          {!isTouch && (
            <button className="btn btn--ghost hide-sm" onClick={() => window.dispatchEvent(new Event('gt3d:request-lock'))}>
              <Icon name="mouse" />
              <span>{t('hud.lock')}</span>
            </button>
          )}
          <button className={`btn btn--ghost ${mapOpen ? 'is-on' : ''}`} onClick={() => setMapOpen((v) => !v)} aria-pressed={mapOpen}>
            <Icon name="map" />
            <span className="hide-sm">{t('hud.map')}</span>
          </button>
          <button className="btn btn--ghost" onClick={() => setCartOpen(true)} aria-label="Kundkorg">
            <Icon name="bag" />
            <span className="hide-sm">Kundkorg</span>
            {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </button>
          <button className="btn btn--ghost" onClick={() => setWishlistOpen(true)} aria-label={t('hud.wishlist')}>
            <Icon name="heart" />
            <span className="hide-sm">{t('hud.wishlist')}</span>
            {wishCount > 0 && <span className="badge">{wishCount}</span>}
          </button>
        </div>
      </header>

      {mapOpen && <Minimap onNavigate={() => window.innerWidth < 700 && setMapOpen(false)} />}

      {locked && (
        <>
          <div className="crosshair" />
          <div className="hud__hint">{t('hud.unlock')}</div>
        </>
      )}

      {tour.active && tour.caption && <div className="tour-caption">{tour.caption}</div>}

      {isTouch && <Joystick />}
      <Tooltip />
      <Toast />
    </div>
  );
}
