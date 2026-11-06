/**
 * Katalog och kassa.
 *
 *   GET  /api/catalog?q=&category=&offset=&limit=   hela sortimentet (sökbart)
 *   GET  /api/catalog/details?ids=a,b,c              pris, bild, storlekar (hämtas live vid behov)
 *   POST /api/checkout { items:[{id,size,color,qty}] } skapar en Stripe Checkout-session
 *   GET  /api/checkout/status?session_id=            kvitto efter betalning
 *
 * Sortimentet kommer från sajtens sitemap (data/catalog.json, skapas vid bygget).
 * Pris, bilder och storlekar läses från varje produktsida: en långsam
 * bakgrundscrawl fyller på efter start, och plagg som visas i katalogen
 * hämtas direkt. Priser till kassan tas alltid från servern – aldrig från webbläsaren.
 *
 * Stripe: sätt STRIPE_SECRET_KEY (sk_test_… för test, sk_live_… för skarpa köp)
 * som miljövariabel på servern (Railway → tjänsten → Variables).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseProduct } from '../scripts/import-ginatricot.mjs';

const UA = 'Mozilla/5.0 (compatible; gina3d-virtual-store/1.0)';
let store = [];
let catalog = [];
let byId = new Map();
const details = new Map(); // id -> { price, currency, image, images, sizes, colors, name, at }
let cacheFile = null;

export function initShop(dir) {
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      return [];
    }
  };
  store = read('products.json');
  catalog = read('catalog.json');
  // butikens plagg först (har redan pris och bild), sedan resten av sortimentet
  const seen = new Set();
  const all = [];
  for (const p of store) {
    seen.add(p.productUrl);
    all.push({ id: p.id, name: p.name, category: p.category, url: p.productUrl, inStore: true });
    details.set(p.id, {
      name: p.name, price: p.price, currency: p.currency || 'SEK', image: p.images?.[0] ?? null, images: p.images ?? [],
      sizes: p.sizes ?? [], colors: p.colors ?? [], at: Date.now(),
    });
  }
  for (const c of catalog) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    all.push({ id: c.id, name: c.name, category: c.category, url: c.url, inStore: false });
  }
  catalog = all;
  byId = new Map(all.map((c) => [c.id, c]));
  cacheFile = path.join(process.env.TMPDIR || '/tmp', 'gina3d-catalog-details.json');
  try {
    for (const [id, d] of Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8')))) if (!details.has(id)) details.set(id, d);
  } catch {
    /* ingen cache ännu */
  }
  console.log(`Katalog: ${catalog.length} produkter (${details.size} med detaljer), Stripe ${process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.includes('_live_') ? 'LIVE (skarpa betalningar)' : 'testläge') : 'inte konfigurerat'}`);
  if (process.env.GT_CRAWL !== '0' && catalog.some((c) => /^https:\/\/www\.ginatricot\.com\//.test(c.url))) setTimeout(crawl, 5000);
}

// ------------------------------------------------------------------ hämtning av produktsidor
const inflight = new Map();
let active = 0;
const queue = [];

function pump() {
  while (active < 4 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

/** Hämtar och tolkar en produktsida (högst 4 samtidigt, delade förfrågningar). */
function fetchDetails(item, priority = false) {
  if (inflight.has(item.id)) return inflight.get(item.id);
  const p = new Promise((resolve) => {
    const job = async () => {
      try {
        const res = await fetch(item.url, { headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE' }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(String(res.status));
        const pr = parseProduct(await res.text(), item.url);
        const imgs = pr.imageUrls.filter((u) => /imgix|ginatricot/.test(u)).map((u) => `${u.split('?')[0]}?w=600&fit=max&auto=format`);
        const d = {
          name: pr.name || item.name, price: pr.price, currency: pr.currency || 'SEK', image: imgs[0] ?? null, images: imgs.slice(0, 6),
          sizes: pr.sizes, colors: pr.colors, material: pr.material, at: Date.now(),
        };
        details.set(item.id, d);
        resolve(d);
      } catch {
        resolve(null);
      } finally {
        inflight.delete(item.id);
      }
    };
    priority ? queue.unshift(job) : queue.push(job);
    pump();
  });
  inflight.set(item.id, p);
  return p;
}

/** Långsam bakgrundscrawl av hela sortimentet (snäll mot sajten: ett par sidor i sekunden). */
async function crawl() {
  let n = 0;
  for (const item of catalog) {
    if (details.has(item.id)) continue;
    await fetchDetails(item);
    if (++n % 50 === 0) persist();
    await new Promise((r) => setTimeout(r, 350));
  }
  persist();
  console.log(`Katalog: crawl klar, ${details.size} av ${catalog.length} produkter med detaljer`);
}

function persist() {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(details)));
  } catch {
    /* skrivskyddat – bara minnet */
  }
}

// ------------------------------------------------------------------ API
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const view = (c) => {
  const d = details.get(c.id);
  return { id: c.id, name: d?.name || c.name, category: c.category, url: c.url, inStore: c.inStore, price: d?.price ?? null, currency: d?.currency ?? 'SEK', image: d?.image ?? null, sizes: d?.sizes ?? null, colors: d?.colors ?? null };
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req, max = 20000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > max) throw new Error('för stor');
  }
  return JSON.parse(body || '{}');
}

const CATEGORIES = ['tops', 'knitwear', 'trousers', 'jeans', 'dresses', 'skirts', 'outerwear', 'bags', 'shoes', 'accessories'];

export async function handleShop(req, res) {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/catalog' && req.method === 'GET') {
      const q = norm(url.searchParams.get('q')).split(/\s+/).filter(Boolean);
      const cat = url.searchParams.get('category') || 'all';
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(96, Math.max(1, Number(url.searchParams.get('limit')) || 48));
      const list = catalog.filter((c) => (cat === 'all' || c.category === cat) && (!q.length || q.every((t) => norm(`${c.name} ${c.category}`).includes(t))));
      const counts = {};
      for (const c of catalog) counts[c.category] = (counts[c.category] || 0) + 1;
      return send(res, 200, {
        total: list.length, offset, items: list.slice(offset, offset + limit).map(view),
        categories: CATEGORIES.filter((k) => counts[k]).map((k) => ({ id: k, count: counts[k] })),
        withDetails: details.size, all: catalog.length,
      });
    }
    if (url.pathname === '/api/catalog/details' && req.method === 'GET') {
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 24);
      const out = await Promise.all(ids.map(async (id) => {
        const c = byId.get(id);
        if (!c) return null;
        if (!details.has(id) && /^https:\/\/www\.ginatricot\.com\//.test(c.url)) await fetchDetails(c, true);
        return view(c);
      }));
      return send(res, 200, { items: out.filter(Boolean) });
    }
    if (url.pathname === '/api/checkout' && req.method === 'POST') return await checkout(req, res, url);
    if (url.pathname === '/api/checkout/status' && req.method === 'GET') return await status(res, url.searchParams.get('session_id'));
    return send(res, 404, { error: 'okänd väg' });
  } catch (e) {
    console.error('shop:', e);
    return send(res, 500, { error: 'Något gick fel. Försök igen.' });
  }
}

// ------------------------------------------------------------------ Stripe
async function stripe(pathname, params, method = 'POST') {
  const key = process.env.STRIPE_SECRET_KEY;
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? body : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || `Stripe ${res.status}`), { stripe: true });
  return json;
}

async function checkout(req, res, url) {
  if (!process.env.STRIPE_SECRET_KEY) return send(res, 503, { error: 'Betalning är inte aktiverad ännu (STRIPE_SECRET_KEY saknas på servern).' });
  const { items } = await readJson(req);
  if (!Array.isArray(items) || !items.length || items.length > 30) return send(res, 400, { error: 'Kundkorgen är tom.' });
  const params = {
    mode: 'payment',
    locale: 'sv',
    'shipping_address_collection[allowed_countries][0]': 'SE',
    'phone_number_collection[enabled]': 'true',
  };
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const safeOrigin = /^https?:\/\/[a-z0-9.:-]+$/i.test(origin) ? origin : url.origin;
  let i = 0;
  for (const it of items) {
    const c = byId.get(String(it.id));
    if (!c) return send(res, 400, { error: 'Ett plagg i korgen finns inte längre.' });
    let d = details.get(c.id);
    if (!d && /^https:\/\/www\.ginatricot\.com\//.test(c.url)) d = await fetchDetails(c, true);
    if (!d?.price) return send(res, 400, { error: `Kunde inte hämta priset för ${c.name}.` });
    const qty = Math.max(1, Math.min(10, Number(it.qty) || 1));
    const size = it.size && d.sizes?.includes(it.size) ? it.size : null;
    const color = typeof it.color === 'string' ? it.color.slice(0, 40) : null;
    const desc = [size && `Storlek ${size}`, color && `Färg ${color}`].filter(Boolean).join(' · ');
    params[`line_items[${i}][quantity]`] = String(qty);
    params[`line_items[${i}][price_data][currency]`] = (d.currency || 'SEK').toLowerCase();
    params[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(d.price * 100));
    params[`line_items[${i}][price_data][product_data][name]`] = d.name || c.name;
    if (desc) params[`line_items[${i}][price_data][product_data][description]`] = desc;
    if (d.image) params[`line_items[${i}][price_data][product_data][images][0]`] = d.image.startsWith('/') ? safeOrigin + d.image : d.image;
    params[`line_items[${i}][price_data][product_data][metadata][product_id]`] = c.id;
    if (size) params[`line_items[${i}][price_data][product_data][metadata][size]`] = size;
    i++;
  }
  params.success_url = `${safeOrigin}/?kop=klart&session_id={CHECKOUT_SESSION_ID}`;
  params.cancel_url = `${safeOrigin}/?kop=avbrutet`;
  try {
    const session = await stripe('checkout/sessions', params);
    return send(res, 200, { url: session.url });
  } catch (e) {
    console.error('Stripe:', e.message);
    return send(res, 502, { error: 'Betalningen kunde inte startas. Försök igen om en stund.' });
  }
}

async function status(res, id) {
  if (!process.env.STRIPE_SECRET_KEY || !/^cs_[A-Za-z0-9_]+$/.test(id || '')) return send(res, 400, { error: 'okänd session' });
  try {
    const s = await stripe(`checkout/sessions/${id}`, null, 'GET');
    return send(res, 200, { paid: s.payment_status === 'paid', amount: s.amount_total / 100, currency: s.currency, email: s.customer_details?.email ?? null });
  } catch {
    return send(res, 502, { error: 'Kunde inte läsa betalningen.' });
  }
}
