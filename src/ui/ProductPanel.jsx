import { useEffect, useRef, useState } from 'react';
import { formatPrice, t } from '../i18n/index.js';
import { useStore } from '../state/useStore.js';
import { canTryOn, colorHex, colorName } from '../data/productMeta.js';
import { startCheckout } from './Cart.jsx';
import { zoneById, zoneForCategory } from '../config/zones.js';

const CATEGORY_LABEL = {
  tops: 'Toppar', jeans: 'Jeans', denim: 'Denim', dresses: 'Klänningar', skirts: 'Kjolar',
  outerwear: 'Ytterkläder', bags: 'Väskor', shoes: 'Skor', accessories: 'Accessoarer',
};

/** Bildkarusell med pilar, punkter, miniatyrer och svep. Bilderna lazy-laddas. */
function Carousel({ images, alt }) {
  const [i, setI] = useState(0);
  const start = useRef(null);
  const n = images.length;
  useEffect(() => setI(0), [images]);
  if (!n) return <div className="carousel carousel--empty" />;
  const go = (d) => setI((v) => (v + d + n) % n);
  return (
    <div className="carousel">
      <div
        className="carousel__viewport"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current == null) return;
          const dx = e.clientX - start.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          start.current = null;
        }}
      >
        <div className="carousel__track" style={{ transform: `translateX(${-i * 100}%)` }}>
          {images.map((src, k) => (
            <div className="carousel__slide" key={src + k}>
              <img src={src} alt={`${alt} – bild ${k + 1}`} loading="lazy" decoding="async" draggable={false} />
            </div>
          ))}
        </div>
        {n > 1 && (
          <>
            <button className="carousel__arrow carousel__arrow--prev" onClick={() => go(-1)} aria-label="Föregående bild">‹</button>
            <button className="carousel__arrow carousel__arrow--next" onClick={() => go(1)} aria-label="Nästa bild">›</button>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="carousel__thumbs">
          {images.map((src, k) => (
            <button key={src + k} className={`carousel__thumb ${k === i ? 'is-active' : ''}`} onClick={() => setI(k)} aria-label={`Visa bild ${k + 1}`}>
              <img src={src} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeartButton({ id, className = '' }) {
  const active = useStore((s) => s.wishlist.includes(id));
  const toggle = useStore((s) => s.toggleWishlist);
  return (
    <button
      className={`heart ${active ? 'is-active' : ''} ${className}`}
      onClick={() => toggle(id)}
      aria-pressed={active}
      aria-label={active ? t('product.removeWish') : t('product.addWish')}
      title={active ? t('product.removeWish') : t('product.addWish')}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function ProductPanel() {
  const product = useStore((s) => (s.selectedId ? s.productsById[s.selectedId] : null));
  const select = useStore((s) => s.select);
  const openTryOn = useStore((s) => s.openTryOn);
  const addToCart = useStore((s) => s.addToCart);
  const showToast = useStore((s) => s.showToast);
  const [needSize, setNeedSize] = useState(false);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    setColor(0);
    setSize(null);
    setNeedSize(false);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const onKey = (e) => e.key === 'Escape' && !useStore.getState().tryOn.open && select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, select]);

  if (!product) return null;
  const tryable = canTryOn(product);
  const zone = zoneById(zoneForCategory(product.category));
  const showInStore = () => {
    const spot = useStore.getState().productSpots[product.id];
    if (!spot) return;
    useStore.getState().navigateTo(spot.x, spot.z, spot.lookAt, spot.level);
    if (window.innerWidth < 700) select(null);
  };

  return (
    <aside className="panel" role="dialog" aria-label={product.name}>
      <div className="panel__head">
        <p className="eyebrow">{CATEGORY_LABEL[product.category] ?? product.category}{zone && zone.name !== CATEGORY_LABEL[product.category] ? ` · ${zone.name}` : ''}</p>
        <button className="panel__close" onClick={() => select(null)} aria-label={t('product.close')}>×</button>
      </div>
      <div className="panel__body">
        <Carousel images={product.images} alt={product.name} />
        <div className="panel__title">
          <h2>{product.name}</h2>
          <HeartButton id={product.id} />
        </div>
        <p className="panel__price">{formatPrice(product.price, product.currency)}</p>

        {product.colors.length > 0 && (
          <div className="panel__group">
            <p className="panel__label">{t('product.colors')}: <span>{colorName(product.colors[color])}</span></p>
            <div className="swatches">
              {product.colors.map((c, k) => (
                <button
                  key={colorName(c) + k}
                  className={`swatch ${k === color ? 'is-active' : ''}`}
                  style={{ '--c': colorHex(c) }}
                  onClick={() => setColor(k)}
                  aria-label={colorName(c)}
                  title={colorName(c)}
                />
              ))}
            </div>
          </div>
        )}

        {product.sizes.length > 0 && (
          <div className="panel__group">
            <p className="panel__label">{t('product.sizes')}{size ? <>: <span>{size}</span></> : ''}</p>
            <div className="sizes">
              {product.sizes.map((s) => (
                <button key={s} className={`size ${s === size ? 'is-active' : ''}`} onClick={() => setSize(s)} aria-pressed={s === size}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel__actions">
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              const multiSize = product.sizes.length > 1;
              if (multiSize && !size) {
                setNeedSize(true);
                return;
              }
              const s = size ?? product.sizes[0] ?? null;
              const added = addToCart(product.id, s, product.colors[color] ?? null);
              showToast(added ? `${product.name} ligger i kundkorgen` : 'Finns redan i kundkorgen');
            }}
          >
            Lägg i kundkorgen
          </button>
          {needSize && !size && <p className="panel__note panel__note--warn">Välj en storlek först.</p>}
          <button className="btn btn--block" disabled={!tryable} onClick={() => openTryOn(product.id)}>
            {t('product.tryOn')}
          </button>
          {!tryable && <p className="panel__note">{t('product.noTryOn')}</p>}
          <button className="btn btn--block" disabled={buying} onClick={async () => {
            if (needSize && !size) return;
            setBuying(true);
            try {
              await startCheckout([{ id: product.id, size: size ?? product.sizes?.[0] ?? null, color: product.colors?.[color] ?? null }]);
            } catch (e) {
              useStore.getState().showToast(e.message);
              setBuying(false);
            }
          }}>
            {buying ? 'Öppnar betalningen …' : 'Köp nu'}
          </button>
          <button className="btn btn--ghost-plain btn--block" onClick={showInStore}>{t('product.showInStore')}</button>
        </div>
      </div>
    </aside>
  );
}
