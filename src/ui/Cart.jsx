import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import { canTryOn, colorName } from '../data/productMeta.js';

/**
 * Kundkorg: samla plagg, gå till provrummet och prova alla med AR.
 * Sparas lokalt i webbläsaren. Köp sker på ginatricot.com (en länk per plagg).
 */
export default function Cart() {
  const open = useStore((s) => s.cartOpen);
  const setOpen = useStore((s) => s.setCartOpen);
  const cart = useStore((s) => s.cart);
  const byId = useStore((s) => s.productsById);
  const remove = useStore((s) => s.removeFromCart);
  const select = useStore((s) => s.select);
  const goToFittingRoom = useStore((s) => s.goToFittingRoom);
  const openTryOn = useStore((s) => s.openTryOn);
  if (!open) return null;
  const items = cart.map((c) => ({ ...c, p: byId[c.id] })).filter((c) => c.p);
  const total = items.reduce((a, c) => a + c.p.price, 0);
  const tryable = items.filter((c) => canTryOn(c.p));
  return (
    <aside className="panel panel--cart" role="dialog" aria-label="Kundkorg">
      <div className="panel__head">
        <p className="eyebrow">Kundkorg ({items.length})</p>
        <button className="panel__close" onClick={() => setOpen(false)} aria-label="Stäng">×</button>
      </div>
      <div className="panel__body">
        {items.length === 0 ? (
          <p className="panel__empty">Kundkorgen är tom. Öppna ett plagg och välj ”Lägg i kundkorgen” – sedan kan du prova allt i provrummet.</p>
        ) : (
          <ul className="wish">
            {items.map((c) => (
              <li key={c.key} className="wish__item">
                <button className="wish__open" onClick={() => select(c.id)}>
                  <img src={c.p.images[0]} alt="" loading="lazy" decoding="async" />
                  <span>
                    <strong>{c.p.name}</strong>
                    <span>
                      {formatPrice(c.p.price, c.p.currency)}
                      {c.size ? ` · ${c.size}` : ''}
                      {c.color ? ` · ${colorName(c.color)}` : ''}
                    </span>
                  </span>
                </button>
                <button className="wish__remove" onClick={() => remove(c.key)} aria-label={`Ta bort ${c.p.name}`}>×</button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <>
            <p className="wish__total">Totalt {formatPrice(total, items[0].p.currency)}</p>
            <div className="panel__actions">
              <button className="btn btn--primary btn--block" disabled={!tryable.length} onClick={goToFittingRoom}>
                Gå till provrummet och prova ({tryable.length})
              </button>
              <button className="btn btn--block" disabled={!tryable.length} onClick={() => openTryOn(null, true)}>
                Prova direkt här
              </button>
            </div>
            <div className="panel__group">
              <p className="panel__label">Köp på ginatricot.com</p>
              {items.map((c) => (
                <a key={c.key} className="link-row" href={c.p.productUrl} target="_blank" rel="noopener noreferrer">
                  {c.p.name}{c.size ? ` (${c.size})` : ''} ↗
                </a>
              ))}
            </div>
          </>
        )}
        <p className="panel__note">Kundkorgen sparas lokalt i din webbläsare. Själva köpet görs på ginatricot.com.</p>
      </div>
    </aside>
  );
}
