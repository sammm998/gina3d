import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import Logo from './Logo.jsx';
import Minimap from './Minimap.jsx';
import Joystick from './Joystick.jsx';
import Tooltip from './Tooltip.jsx';
import { STAFF } from '../config/staff.js';
import { FITTING_BOOTHS } from '../config/fixtures.js';
import { staffState } from '../scene/staff/Staff.jsx';
import { player } from '../nav/playerState.js';
import { startTour, stopTour, useTourController } from './Tour.js';
import { musicPreference, saveMusicPreference, startMusic, stopMusic } from '../audio/music.js';
import CheckoutBanner from './CheckoutBanner.jsx';

function Icon({ name }) {
  const paths = {
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
    play: 'M8 5v14l11-7z',
    stop: 'M7 7h10v10H7z',
    mouse: 'M12 3a5 5 0 0 0-5 5v8a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5zm0 0v5',
    bag: 'M5 8h14l-1 12H6L5 8zm4 0V6a3 3 0 0 1 6 0v2',
    chat: 'M4 5h16v11H9l-5 4V5z',
    grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
    music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    mute: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM3 3l18 18',
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
  // bakgrundsmusik: på som standard (startar efter klicket in i butiken), valet sparas
  const [music, setMusic] = useState(musicPreference);
  useEffect(() => {
    if (music) startMusic();
    else stopMusic();
  }, [music]);
  const toggleMusic = () => setMusic((m) => { saveMusicPreference(!m); return !m; });
  const isTouch = useStore((s) => s.isTouch);
  const locked = useStore((s) => s.pointerLocked);
  const tour = useStore((s) => s.tour);
  const wishCount = useStore((s) => s.wishlist.length);
  const setWishlistOpen = useStore((s) => s.setWishlistOpen);
  const cartCount = useStore((s) => s.cart.length);
  // närmaste medarbetare på samma våning (annars den första)
  const openNearestStaff = () => {
    let best = STAFF[0], bestD = Infinity;
    for (const s of STAFF) {
      const p = staffState[s.id];
      if (!p) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z) + (p.level === player.level ? 0 : 100);
      if (d < bestD) { bestD = d; best = s; }
    }
    useStore.getState().openChat(best.id);
  };
  const setCartOpen = useStore((s) => s.setCartOpen);
  const arrived = useStore((s) => s.arrivedNavId);
  const fittingNavId = useStore((s) => s.fittingNavId);
  // Kliver man in i en provhytt öppnas provningen med kundkorgens plagg
  // (en gång per besök i hytten).
  useEffect(() => {
    let raf;
    let inside = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useStore.getState();
      const booth = player.level === 0 && player.mode === 'floor'
        ? FITTING_BOOTHS.find(({ rect: [x0, z0, x1, z1] }) => player.x > x0 && player.x < x1 && player.z > z0 && player.z < z1)
        : null;
      if (booth && booth.id !== inside && !s.tryOn.open) {
        s.openTryOn(null, true);
        if (s.fittingNavId) useStore.setState({ fittingNavId: 0 });
      }
      inside = booth?.id ?? null;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  // framme i provrummet → öppna provningen med kundkorgens plagg
  useEffect(() => {
    if (fittingNavId && arrived === fittingNavId && !useStore.getState().tryOn.open) {
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
          <button className="btn btn--ghost" onClick={openNearestStaff} aria-label="Fråga personalen">
            <Icon name="chat" />
            <span className="hide-sm">Fråga personalen</span>
          </button>
          <button className="btn btn--ghost" onClick={() => setCartOpen(true)} aria-label="Kundkorg">
            <Icon name="bag" />
            <span className="hide-sm">Kundkorg</span>
            {cartCount > 0 && <span className="badge">{cartCount}</span>}
          </button>
          <a className="btn btn--ghost" href="/katalog" aria-label="Katalog">
            <Icon name="grid" />
            <span className="hide-sm">Katalog</span>
          </a>
          <button className={`btn btn--ghost ${music ? 'is-on' : ''}`} onClick={toggleMusic} aria-pressed={music} aria-label={music ? 'Stäng av musiken' : 'Sätt på musiken'} title={music ? 'Musik på' : 'Musik av'}>
            <Icon name={music ? 'music' : 'mute'} />
          </button>
          <button className="btn btn--ghost" onClick={() => setWishlistOpen(true)} aria-label={t('hud.wishlist')}>
            <Icon name="heart" />
            <span className="hide-sm">{t('hud.wishlist')}</span>
            {wishCount > 0 && <span className="badge">{wishCount}</span>}
          </button>
        </div>
      </header>

      <CheckoutBanner />
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
