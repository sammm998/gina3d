import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';

/** Namn och pris när man hovrar över en produkt. */
export default function Tooltip() {
  const hovered = useStore((s) => s.hovered);
  const product = useStore((s) => (s.hovered ? s.productsById[s.hovered.id] : null));
  const locked = useStore((s) => s.pointerLocked);
  if (!hovered || !product) return null;
  const style = locked
    ? { left: '50%', top: '50%', transform: 'translate(-50%, 22px)' }
    : { left: Math.min(hovered.x, window.innerWidth - 220), top: Math.min(hovered.y, window.innerHeight - 80) };
  return (
    <div className="tooltip" style={style}>
      <strong>{product.name}</strong>
      <span>{formatPrice(product.price, product.currency)}</span>
    </div>
  );
}
