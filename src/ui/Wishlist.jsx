import { formatPrice, t } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';

/** Önskelista – sparas i webbläsarens localStorage (se state/useStore.js). */
export default function Wishlist() {
  const open = useStore((s) => s.wishlistOpen);
  const setOpen = useStore((s) => s.setWishlistOpen);
  const ids = useStore((s) => s.wishlist);
  const byId = useStore((s) => s.productsById);
  const toggle = useStore((s) => s.toggleWishlist);
  const select = useStore((s) => s.select);
  if (!open) return null;
  const items = ids.map((id) => byId[id]).filter(Boolean);
  const total = items.reduce((a, p) => a + p.price, 0);
  return (
    <aside className="panel panel--wishlist" role="dialog" aria-label={t('hud.wishlist')}>
      <div className="panel__head">
        <p className="eyebrow">{t('hud.wishlist')} ({items.length})</p>
        <button className="panel__close" onClick={() => setOpen(false)} aria-label={t('product.close')}>×</button>
      </div>
      <div className="panel__body">
        {items.length === 0 ? (
          <p className="panel__empty">{t('wishlist.empty')}</p>
        ) : (
          <ul className="wish">
            {items.map((p) => (
              <li key={p.id} className="wish__item">
                <button className="wish__open" onClick={() => select(p.id)}>
                  <img src={p.images[0]} alt="" loading="lazy" decoding="async" />
                  <span>
                    <strong>{p.name}</strong>
                    <span>{formatPrice(p.price, p.currency)}</span>
                  </span>
                </button>
                <button className="wish__remove" onClick={() => toggle(p.id)} aria-label={`${t('product.removeWish')}: ${p.name}`}>×</button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && <p className="wish__total">Totalt {formatPrice(total, items[0].currency)}</p>}
        <p className="panel__note">{t('wishlist.saved')}</p>
      </div>
    </aside>
  );
}
