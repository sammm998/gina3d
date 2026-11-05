import { useEffect, useRef } from 'react';
import { TOUR_ORDER, zoneById } from '../config/zones.js';
import { useStore } from '../state/useStore.js';
import { t } from '../i18n/index.js';

const PAUSE_MS = 5000;

/** Guidad tur: går automatiskt mellan zonerna i TOUR_ORDER. */
export function useTourController() {
  const tour = useStore((s) => s.tour);
  const arrived = useStore((s) => s.arrivedNavId);
  const navId = useRef(0);
  const timer = useRef(null);

  // Starta varje steg.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!tour.active) return;
    const zone = zoneById(TOUR_ORDER[tour.step]);
    if (!zone) {
      useStore.getState().setTour({ active: false, step: 0, caption: '' });
      useStore.getState().showToast(t('tour.done'));
      return;
    }
    const v = zone.viewpoint;
    navId.current = useStore.getState().navigateTo(v.x, v.z, v.lookAt, zone.level || 0);
    useStore.getState().setTour({ caption: `${zone.name} – ${zone.tour}` });
  }, [tour.active, tour.step]);

  // Vänta en stund i varje zon och gå sedan vidare.
  useEffect(() => {
    if (!tour.active || arrived !== navId.current) return;
    timer.current = setTimeout(() => {
      const s = useStore.getState();
      if (s.tour.active) s.setTour({ step: s.tour.step + 1 });
    }, PAUSE_MS);
    return () => clearTimeout(timer.current);
  }, [arrived, tour.active]);
}

export function startTour() {
  useStore.getState().setTour({ active: true, step: 0, caption: '' });
}

export function stopTour() {
  const s = useStore.getState();
  s.setTour({ active: false, step: 0, caption: '' });
  s.cancelNav();
}
