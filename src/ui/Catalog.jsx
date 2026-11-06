import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import Cart from './Cart.jsx';
import CheckoutBanner from './CheckoutBanner.jsx';
import { PATHS } from '../config/storeConfig.js';

const CAT_NAMES = {
  all: 'Allt', tops: 'Toppar', knitwear: 'Stickat', trousers: 'Byxor', jeans: 'Jeans', dresses: 'Klänningar',
  skirts: 'Kjolar', outerwear: 'Ytterkläder', bags: 'Väskor', shoes: 'Skor', accessories: 'Accessoarer',
};
const PAGE = 48;

/**
 * Katalog: hela Gina Tricots sortiment från ginatricot.com med bilder och priser.
 * Listan kommer från servern (/api/catalog); pris och bild för plagg som ännu
 * inte crawlats hämtas när kortet syns.
 */
export default function Catalog() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [data, setData] = useState({ items: [], total: 0, categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cartCount = useStore((s) => s.cart.length);
  const setCartOpen = useStore((s) => s.setCartOpen);
  const req = useRef(0);

  const load = useCallback(async (offset = 0) => {
    const id = ++req.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}&category=${cat}&offset=${offset}&limit=${PAGE}`);
      const json = await res.json();
      if (id !== req.current) return;
      setData((d) => ({ ...json, items: offset ? [...d.items, ...json.items] : json.items }));
      setError('');
    } catch {
      if (id === req.current) setError('Katalogen kunde inte laddas. Försök igen.');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [q, cat]);

  useEffect(() => {
    const t = setTimeout(() => load(0), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // hämta pris och bild för kort som saknar dem (i omgångar om 24)
  useEffect(() => {
    const missing = data.items.filter((p) => p.price == null && !p._asked).slice(0, 24);
    if (!missing.length) return;
    missing.forEach((p) => (p._asked = true));
    fetch(`/api/catalog/details?ids=${missing.map((p) => p.id).join(',')}`)
      .then((r) => r.json())
      .then(({ items }) => {
        const map = Object.fromEntries(items.map((x) => [x.id, x]));
        setData((d) => ({ ...d, items: d.items.map((p) => (map[p.id] ? { ...p, ...map[p.id], _asked: true } : p)) }));
      })
      .catch(() => {});
  }, [data.items]);

  return (
    <div className="catalog">
      <header className="catalog__head">
        <a href="/" className="catalog__logo" aria-label="Till 3D-butiken">
          <img src={PATHS.logo} alt="Gina Tricot" />
        </a>
        <nav className="catalog__nav">
          <a className="btn btn--ghost" href="/">Till 3D-butiken</a>
          <button className="btn" onClick={() => setCartOpen(true)}>Kundkorg{cartCount ? ` (${cartCount})` : ''}</button>
        </nav>
      </header>
      <CheckoutBanner />
      <section className="catalog__intro">
        <h1>Katalog</h1>
        <p>Hela sortimentet från ginatricot.com – {data.all ? `${data.all.toLocaleString('sv-SE')} produkter` : 'laddar …'}.</p>
        <input className="catalog__search" type="search" placeholder="Sök, t.ex. ”svart klänning” eller ”jeans”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök i katalogen" />
        <div className="catalog__chips" role="tablist">
          {[{ id: 'all' }, ...data.categories].map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={`chip ${cat === c.id ? 'is-active' : ''}`} onClick={() => setCat(c.id)}>
              {CAT_NAMES[c.id] ?? c.id}{c.count ? ` · ${c.count}` : ''}
            </button>
          ))}
        </div>
      </section>
      {error && <p className="catalog__error">{error}</p>}
      <ul className="catalog__grid">
        {data.items.map((p) => <CatalogCard key={p.id} p={p} />)}
      </ul>
      <div className="catalog__more">
        {loading ? <p>Laddar …</p> : data.items.length < data.total ? (
          <button className="btn" onClick={() => load(data.items.length)}>Visa fler ({data.total - data.items.length} kvar)</button>
        ) : data.total === 0 ? <p>Inga produkter hittades.</p> : null}
      </div>
      <Cart />
    </div>
  );
}

function CatalogCard({ p }) {
  const add = useStore((s) => s.addToCart);
  const setCartOpen = useStore((s) => s.setCartOpen);
  const [size, setSize] = useState('');
  const [msg, setMsg] = useState('');
  const sizes = p.sizes ?? [];
  const onAdd = () => {
    if (sizes.length > 1 && !size) return setMsg('Välj storlek');
    const ok = add(p.id, size || sizes[0] || null, null, { name: p.name, price: p.price, currency: p.currency, image: p.image, url: p.url });
    setMsg(ok ? 'Tillagd' : 'Finns redan i korgen');
    if (ok) setTimeout(() => setCartOpen(true), 300);
  };
  return (
    <li className="ccard">
      <a className="ccard__img" href={p.url} target="_blank" rel="noopener noreferrer">
        {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" /> : <span className="ccard__ph" aria-hidden />}
      </a>
      <div className="ccard__body">
        <p className="ccard__name">{p.name}</p>
        <p className="ccard__price">{p.price != null ? formatPrice(p.price, p.currency) : '…'}</p>
        {sizes.length > 1 && (
          <select className="ccard__size" value={size} onChange={(e) => { setSize(e.target.value); setMsg(''); }} aria-label={`Storlek för ${p.name}`}>
            <option value="">Storlek</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button className="btn btn--primary btn--block" disabled={p.price == null} onClick={onAdd}>Lägg i kundkorgen</button>
        {msg && <p className="ccard__msg">{msg}</p>}
      </div>
    </li>
  );
}
