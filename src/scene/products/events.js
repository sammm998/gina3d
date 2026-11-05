import { useStore } from '../../state/useStore.js';

/**
 * Händelser för klick och hover på produkter. Hover ger en lätt highlight
 * och en etikett med namn och pris (se ui/Tooltip.jsx); klick öppnar panelen.
 * `idOf(e)` används för instansierade meshar där produkten beror på instanceId.
 */
export function productEvents(productId, idOf) {
  const resolve = (e) => (idOf ? idOf(e) : productId);
  return {
    onPointerOver: (e) => {
      const s = useStore.getState();
      if (s.pointerLocked || s.isTouch && e.pointerType === 'touch') return;
      e.stopPropagation();
      const id = resolve(e);
      if (!id) return;
      s.setHovered({ id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      document.body.classList.add('is-hovering');
    },
    onPointerMove: (e) => {
      const s = useStore.getState();
      if (s.pointerLocked || e.pointerType === 'touch') return;
      e.stopPropagation();
      const id = resolve(e);
      if (!id) return;
      s.setHovered({ id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    },
    onPointerOut: (e) => {
      const s = useStore.getState();
      const id = resolve(e);
      if (!s.hovered || s.hovered.id === id || !id) s.setHovered(null);
      document.body.classList.remove('is-hovering');
    },
    onClick: (e) => {
      const s = useStore.getState();
      if (s.pointerLocked || s.tryOn.open) return;
      if (e.delta > 6) return; // drag, inte klick
      e.stopPropagation();
      const id = resolve(e);
      if (id) s.select(id);
    },
  };
}

/** Sant när produkten är hovrad eller vald – används för highlight. */
export function useIsHighlighted(productId) {
  return useStore((s) => s.hovered?.id === productId || s.selectedId === productId);
}
