import { useState } from 'react';
import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import { canTryOn, colorName } from '../data/productMeta.js';

/** Plaggen i korgen: från 3D-butiken (fullständiga produkter) eller katalogen (ögonblicksbild). */
export function useCartItems() {
  const cart = useStore((s) => s.cart);
  const byId = useStore((s) => s.productsById);
  return cart
    .map((c) => {
      const p = byId[c.id] ?? (c.snap ? { id: c.id, name: c.snap.name, price: c.snap.price, currency: c.snap.currency || 'SEK', images: [c.snap.image].filter(Boolean), productUrl: c.snap.url, fromCatalog: true } : null);
      return { ...c, p };
    })
    .filter((c) => c.p);
}

/** Startar Stripe Checkout på servern (priserna räknas där) och skickar vidare till betalningen. */
export async function startCheckout(items) {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map((c) => ({ id: c.id, size: c.size, color: c.color, qty: 1 })) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'Betalningen kunde inte startas.');
  window.location.assign(data.url);
}

/**
 * Kundkorg: samla plagg, prova dem i provrummet och betala med kort via Stripe.
 * Korgen sparas lokalt i webbläsaren.
 */
export default function Cart() {
  const open = useStore((s) => s.cartOpen);
  const setOpen = useStore((s) => s.setCartOpen);
  const remove = useStore((s) => s.removeFromCart);
  const select = useStore((s) => s.select);
  const goToFittingRoom = useStore((s) => s.goToFittingRoom);
  const openTryOn = useStore((s) => s.openTryOn);
  const items = useCartItems();
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return null;
  const total = items.reduce((a, c) => a + (c.p.price || 0), 0);
  const tryable = items.filter((c) => !c.p.fromCatalog && canTryOn(c.p));
  const inStore = !window.location.pathname.startsWith('/katalog');
  const pay = async () => {
    setErr('');
    setPaying(true);
    try {
      await startCheckout(items);
    } catch (e) {
      setErr(e.message);
      setPaying(false);
    }
  };
  return (
    <aside className="panel panel--cart" role="dialog" aria-label="Kundkorg">
      <div className="panel__head">
        <p className="eyebrow">Kundkorg ({items.length})</p>
        <button className="panel__close" onClick={() => setOpen(false)} aria-label="Stäng">×</button>
      </div>
      <div className="panel__body">
        {items.length === 0 ? (
          <p className="panel__empty">Kundkorgen är tom. Välj ”Lägg i kundkorgen” på ett plagg i butiken eller i katalogen.</p>
        ) : (
          <ul className="wish">
            {items.map((c) => (
              <li key={c.key} className="wish__item">
                <button className="wish__open" onClick={() => !c.p.fromCatalog && inStore && select(c.id)}>
                  {c.p.images[0] ? <img src={c.p.images[0]} alt="" loading="lazy" decoding="async" /> : <span className="wish__ph" />}
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
              <button className="btn btn--primary btn--block" disabled={paying} onClick={pay}>
                {paying ? 'Öppnar betalningen …' : 'Till kassan – betala med kort'}
              </button>
              {err && <p className="panel__error" role="alert">{err}</p>}
              {inStore && (
                <>
                  <button className="btn btn--block" disabled={!tryable.length} onClick={goToFittingRoom}>
                    Gå till provrummet och prova ({tryable.length})
                  </button>
                  <button className="btn btn--block" disabled={!tryable.length} onClick={() => openTryOn(null, true)}>
                    Prova direkt här
                  </button>
                </>
              )}
            </div>
          </>
        )}
        <p className="panel__note">Betalningen sker säkert via Stripe – kortuppgifterna hanteras aldrig av den här sidan.</p>
      </div>
    </aside>
  );
}
