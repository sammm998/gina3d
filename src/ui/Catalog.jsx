import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPrice } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import Cart, { startCheckout } from './Cart.jsx';
import CheckoutBanner from './CheckoutBanner.jsx';
import { PATHS } from '../config/storeConfig.js';

const CAT_NAMES = {
  all: 'Allt', tops: 'Toppar', knitwear: 'Stickat', trousers: 'Byxor', jeans: 'Jeans', dresses: 'Klänningar',
  skirts: 'Kjolar', outerwear: 'Ytterkläder', bags: 'Väskor', shoes: 'Skor', accessories: 'Accessoarer', missy: 'Miss Y',
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
  const [openP, setOpenP] = useState(null);
  const [aiQ, setAiQ] = useState('');
  const [ai, setAi] = useState(null); // { summary, items }
  const [aiBusy, setAiBusy] = useState(false);
  const runAi = (e) => {
    e?.preventDefault();
    runAiWith(aiQ);
  };
  const runAiWith = async (text) => {
    if (!text.trim()) return;
    setAiBusy(true);
    try {
      const r = await fetch(`/api/catalog/ai?q=${encodeURIComponent(text)}`);
      const j = await r.json();
      setAi(r.ok ? j : { summary: j.error || 'Sökningen fungerade inte.', items: [] });
    } catch {
      setAi({ summary: 'Sökningen fungerade inte just nu.', items: [] });
    } finally {
      setAiBusy(false);
    }
  };

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
        <section className="aisearch">
          <div className="aisearch__head">
            <span className="aisearch__spark" aria-hidden>✦</span>
            <div>
              <p className="aisearch__title">Personlig stylist</p>
              <p className="aisearch__sub">Beskriv vad du letar efter – plaggtyp, färg, tillfälle eller budget – så hittar vi förslag åt dig.</p>
            </div>
          </div>
          <form className="aisearch__form" onSubmit={runAi}>
            <input value={aiQ} onChange={(e) => setAiQ(e.target.value)} placeholder="T.ex. ”något svart och kort till nyår under 400 kr”" aria-label="Beskriv vad du letar efter" />
            <button className="btn btn--primary" disabled={aiBusy || !aiQ.trim()}>{aiBusy ? 'Letar …' : 'Hitta förslag'}</button>
          </form>
          {!ai && !aiBusy && (
            <div className="aisearch__examples">
              {['Något svart och kort', 'Vida jeans i ljus tvätt', 'Mysig stickad tröja i beige', 'Festklänning under 500 kr'].map((ex) => (
                <button key={ex} className="chip" onClick={() => { setAiQ(ex); setTimeout(() => runAiWith(ex), 0); }}>{ex}</button>
              ))}
            </div>
          )}
          {aiBusy && <div className="aisearch__loading"><span /><span /><span /> Letar i hela sortimentet …</div>}
          {ai && !aiBusy && (
            <div className="aisearch__result">
              <p>{ai.summary} {ai.items.length ? <strong>{ai.items.length} förslag</strong> : '– inga träffar, prova att beskriva på ett annat sätt.'}</p>
              {ai.filters?.length > 0 && <div className="aisearch__filters">{ai.filters.map((f) => <span key={f}>{f}</span>)}</div>}
              <button className="btn btn--ghost-plain" onClick={() => { setAi(null); setAiQ(''); }}>Visa hela katalogen</button>
            </div>
          )}
        </section>
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
        {(ai?.items ?? data.items).map((p) => <CatalogCard key={p.id} p={p} onOpen={setOpenP} />)}
      </ul>
      <div className="catalog__more">
        {ai ? null : loading ? <p>Laddar …</p> : data.items.length < data.total ? (
          <button className="btn" onClick={() => load(data.items.length)}>Visa fler ({data.total - data.items.length} kvar)</button>
        ) : data.total === 0 ? <p>Inga produkter hittades.</p> : null}
      </div>
      {openP && <ProductModal p={openP} onClose={() => setOpenP(null)} />}
      <Cart />
    </div>
  );
}

function CatalogCard({ p, onOpen }) {
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
      <button className="ccard__img" onClick={() => onOpen(p)} aria-label={`Visa ${p.name}`}>
        {p.image ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" /> : <span className="ccard__ph" aria-hidden />}
      </button>
      <div className="ccard__body">
        <button className="ccard__name" onClick={() => onOpen(p)}>{p.name}</button>
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

/** Produktvy i katalogen: bilder, storlek och köp direkt (Stripe) – ingen länk ut. */
function ProductModal({ p: base, onClose }) {
  const [p, setP] = useState(base);
  const [img, setImg] = useState(0);
  const [size, setSize] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const add = useStore((s) => s.addToCart);
  useEffect(() => {
    fetch(`/api/catalog/details?ids=${encodeURIComponent(base.id)}`).then((r) => r.json()).then(({ items }) => items?.[0] && setP((x) => ({ ...x, ...items[0] }))).catch(() => {});
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [base.id, onClose]);
  const images = p.images?.length ? p.images : [p.image].filter(Boolean);
  const sizes = p.sizes ?? [];
  const need = sizes.length > 1 && !size;
  const snap = { name: p.name, price: p.price, currency: p.currency, image: p.image, url: p.url };
  const toCart = () => {
    if (need) return setMsg('Välj storlek först');
    const ok = add(p.id, size || sizes[0] || null, null, snap);
    setMsg(ok ? 'Tillagd i kundkorgen' : 'Finns redan i kundkorgen');
  };
  const buyNow = async () => {
    if (need) return setMsg('Välj storlek först');
    setBusy(true);
    setMsg('');
    try {
      await startCheckout([{ id: p.id, size: size || sizes[0] || null, color: null }]);
    } catch (e) {
      setMsg(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="pmodal" role="dialog" aria-label={p.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pmodal__box">
        <button className="panel__close pmodal__close" onClick={onClose} aria-label="Stäng">×</button>
        <div className="pmodal__media">
          {images[img] ? <img src={images[img]} alt={p.name} /> : <span className="ccard__ph" />}
          {images.length > 1 && (
            <div className="pmodal__thumbs">
              {images.map((u, i) => (
                <button key={u} className={i === img ? 'is-active' : ''} onClick={() => setImg(i)}><img src={u} alt="" /></button>
              ))}
            </div>
          )}
        </div>
        <div className="pmodal__info">
          <h2>{p.name}</h2>
          <p className="pmodal__price">{p.price != null ? formatPrice(p.price, p.currency) : '…'}</p>
          {p.colors?.length > 0 && <p className="pmodal__meta">Färg: {p.colors.join(', ')}</p>}
          {sizes.length > 0 && (
            <>
              <p className="pmodal__label">Välj storlek</p>
              <div className="pmodal__sizes">
                {sizes.map((s) => <button key={s} className={`chip ${size === s ? 'is-active' : ''}`} onClick={() => { setSize(s); setMsg(''); }}>{s}</button>)}
              </div>
            </>
          )}
          <button className="btn btn--primary btn--block" disabled={busy || p.price == null} onClick={buyNow}>{busy ? 'Öppnar betalningen …' : 'Köp nu'}</button>
          <button className="btn btn--block" disabled={p.price == null} onClick={toCart}>Lägg i kundkorgen</button>
          {msg && <p className="ccard__msg">{msg}</p>}
          {p.material && <p className="pmodal__meta">Material: {p.material}</p>}
          <p className="pmodal__note">Säker kortbetalning via Stripe.</p>
        </div>
      </div>
    </div>
  );
}
