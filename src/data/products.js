import { PATHS } from '../config/storeConfig.js';

/**
 * Läser /data/products.json och validerar fälten.
 * Format: { id, name, price, currency, category, colors[], sizes[], images[],
 *           tryOnImage, productUrl, tryOnType?, tryOnAnchors? }
 */
export async function loadProducts(url = PATHS.products) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Kunde inte läsa ${url} (${res.status})`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('products.json måste vara en lista');
  return raw
    .filter((p) => p && p.id && p.name)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      price: Number(p.price) || 0,
      currency: p.currency || 'SEK',
      category: String(p.category || '').toLowerCase(),
      colors: Array.isArray(p.colors) ? p.colors : [],
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      images: Array.isArray(p.images) ? p.images : [],
      tryOnImage: p.tryOnImage || null,
      productUrl: p.productUrl || 'https://www.ginatricot.com/se',
      tryOnType: p.tryOnType || null,
      tryOnAnchors: p.tryOnAnchors || null,
    }));
}
