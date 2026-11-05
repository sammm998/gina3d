#!/usr/bin/env node
/**
 * Importerar riktiga produkter från ginatricot.com till data/products.json.
 *
 *   npm run import:ginatricot -- --urls data/import-urls.txt
 *   npm run import:ginatricot -- --url https://www.ginatricot.com/se/... --url https://...
 *   npm run import:ginatricot -- --category-url https://www.ginatricot.com/se/jeans --limit 6
 *
 * Flaggor:
 *   --urls <fil>          textfil med en produkt-URL per rad (# = kommentar).
 *                         En rad kan börja med en kategori: "jeans https://..."
 *   --url <url>           en produkt-URL (kan upprepas)
 *   --category-url <url>  kategorisida – produktlänkar hämtas automatiskt (best effort)
 *   --category <id>       tvinga kategori (tops, jeans, dresses, skirts, outerwear, bags, shoes …)
 *   --limit <n>           max antal produkter per kategorisida (standard 8)
 *   --append              lägg till i befintlig products.json i stället för att ersätta
 *   --no-cutout           hoppa över automatisk friläggning av tryOnImage
 *
 * Så fungerar det:
 *   1. Produktsidan hämtas och strukturerad data läses ut (schema.org Product i JSON-LD,
 *      med Open Graph-taggar som reserv): namn, pris, valuta, färg, storlekar, bilder.
 *   2. Bilderna laddas ner till assets/products/ginatricot/.
 *   3. tryOnImage (transparent PNG) skapas automatiskt om paketet
 *      @imgly/background-removal-node är installerat:
 *        npm i -D @imgly/background-removal-node
 *      Annars importeras produkten utan tryOnImage (AR-provning avstängd för den) tills
 *      du lägger en frilagd PNG som assets/products/ginatricot/<id>-tryon.png och kör igen.
 *
 * Kör skriptet från en dator/miljö som når www.ginatricot.com. Bilderna och texterna
 * tillhör Gina Tricot – använd dem bara med varumärkets tillstånd.
 */
import fs from 'node:fs';
import path from 'node:path';
import { anchors as estimateAnchors, classify, cutout as cutoutBg } from './lib/garment-image.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'products', 'ginatricot');
const DATA = path.join(ROOT, 'data', 'products.json');
const PUBLIC_PREFIX = '/assets/products/ginatricot';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ------------------------------------------------------------------ argument

function parseArgs(argv) {
  const a = { urls: [], categoryUrls: [], limit: 8, append: false, cutout: true, category: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--url') a.urls.push({ url: v() });
    else if (k === '--urls') {
      for (const line of fs.readFileSync(v(), 'utf8').split('\n')) {
        const s = line.trim();
        if (!s || s.startsWith('#')) continue;
        const parts = s.split(/\s+/);
        if (parts.length > 1) a.urls.push({ category: parts[0], url: parts[1] });
        else a.urls.push({ url: parts[0] });
      }
    } else if (k === '--category-url') a.categoryUrls.push(v());
    else if (k === '--category') a.category = v();
    else if (k === '--limit') a.limit = Number(v()) || 8;
    else if (k === '--append') a.append = true;
    else if (k === '--no-cutout') a.cutout = false;
    else if (k === '--help' || k === '-h') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    }
  }
  return a;
}

// ------------------------------------------------------------------ hämtning

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE,sv;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} för ${url}`);
  return res.text();
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.ginatricot.com/' } });
  if (!res.ok) throw new Error(`${res.status} för bild ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return res.headers.get('content-type') || '';
}

// ------------------------------------------------------------------ tolkning

export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[1].trim());
      const stack = Array.isArray(j) ? [...j] : [j];
      while (stack.length) {
        const n = stack.shift();
        if (!n || typeof n !== 'object') continue;
        out.push(n);
        if (Array.isArray(n['@graph'])) stack.push(...n['@graph']);
      }
    } catch {
      /* ogiltig JSON-LD – hoppa över */
    }
  }
  return out;
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop.replace(/[:.]/g, '\\$&')}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop.replace(/[:.]/g, '\\$&')}["']`, 'i');
  return (html.match(re) || html.match(re2) || [])[1] ?? null;
}

const decode = (s) => (s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const typeOf = (n) => [].concat(n['@type'] || []).map(String);
const toArr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const imgUrl = (x) => (typeof x === 'string' ? x : x?.url || x?.contentUrl || null);

/** Plockar ut produktdata ur en produktsidas HTML. */
export function parseProduct(html, pageUrl) {
  const nodes = extractJsonLd(html);
  const group = nodes.find((n) => typeOf(n).includes('ProductGroup'));
  const prod = nodes.find((n) => typeOf(n).includes('Product')) || group;
  const variants = toArr(group?.hasVariant || prod?.hasVariant);

  const rawName = decode(prod?.name || meta(html, 'og:title') || '');
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  if (!name) throw new Error('Hittade inget produktnamn (ingen JSON-LD/Open Graph på sidan)');

  const offers = [...toArr(prod?.offers), ...variants.flatMap((v) => toArr(v.offers))];
  const flatOffers = offers.flatMap((o) => (o?.['@type'] === 'AggregateOffer' ? [o, ...toArr(o.offers)] : [o]));
  const priced = flatOffers.find((o) => o?.price != null || o?.lowPrice != null);
  const price = Number(priced?.price ?? priced?.lowPrice ?? meta(html, 'product:price:amount') ?? 0);
  const currency = priced?.priceCurrency || meta(html, 'product:price:currency') || 'SEK';

  const images = [...new Set([
    ...toArr(prod?.image).map(imgUrl),
    ...variants.flatMap((v) => toArr(v.image).map(imgUrl)),
    meta(html, 'og:image'),
  ].filter(Boolean).map((u) => new URL(decode(u), pageUrl).href))];

  const colors = [...new Set([prod?.color, ...variants.map((v) => v.color)].filter(Boolean).map(decode))];
  const sizes = [...new Set([prod?.size, ...variants.map((v) => v.size)].flat().filter(Boolean).map((s) => decode(typeof s === 'string' ? s : s.name)))];

  const sku = prod?.sku || prod?.productID || prod?.mpn || group?.productGroupID || null;
  const slug = new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || name;
  const id = `gt-${String(sku || slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

  return { id, name, price, currency, colors, sizes, imageUrls: images, productUrl: pageUrl, breadcrumb: breadcrumbText(nodes), material: prod?.material ? decode(prod.material) : null };
}

function breadcrumbText(nodes) {
  const bc = nodes.find((n) => typeOf(n).includes('BreadcrumbList'));
  return toArr(bc?.itemListElement).map((e) => e?.name || e?.item?.name || '').join(' / ');
}

/** Svenska kategorinamn/URL-delar -> butikens kategori-id (se src/config/zones.js). */
const CATEGORY_RULES = [
  [/jeans|denim/, 'jeans'],
  [/klänning|klanning|dress/, 'dresses'],
  [/kjol|skirt/, 'skirts'],
  [/jack|kapp|rock|coat|blazer|ytterkläder|ytterklader|puffer|trench/, 'outerwear'],
  [/väsk|vask|bag|shopper/, 'bags'],
  [/sko|skor|shoe|boots|stövl|loafer|sneaker|sandal/, 'shoes'],
  [/byxor|trousers|pants|shorts/, 'trousers'],
  [/smycken|accessoar|accessor|halsband|örhäng|scarf|bälte|solglas/, 'accessories'],
  [/topp|top|t-shirt|tröj|blus|skjort|stick|linne|body|shirt|knit/, 'tops'],
];

export function guessCategory(...texts) {
  const s = texts.join(' ').toLowerCase();
  for (const [re, cat] of CATEGORY_RULES) if (re.test(s)) return cat;
  return 'tops';
}

/** Hämtar produktlänkar från en kategorisida (best effort: JSON-LD ItemList, annars länkar). */
export function productLinksFromCategory(html, pageUrl, limit) {
  const nodes = extractJsonLd(html);
  const list = nodes.find((n) => typeOf(n).includes('ItemList'));
  let links = toArr(list?.itemListElement).map((e) => e?.url || e?.item?.url || (typeof e?.item === 'string' ? e.item : null)).filter(Boolean);
  if (!links.length) {
    const base = new URL(pageUrl);
    const seen = new Set();
    const re = /href=["']([^"'#?]+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const u = new URL(decode(m[1]), base);
      if (u.host !== base.host) continue;
      const parts = u.pathname.split('/').filter(Boolean);
      // produktsidor ligger normalt djupare än kategorisidan och slutar med ett id/artikelnummer
      if (parts.length <= base.pathname.split('/').filter(Boolean).length) continue;
      if (!/\d{4,}/.test(parts[parts.length - 1])) continue;
      seen.add(u.href);
    }
    links = [...seen];
  }
  return links.map((u) => new URL(u, pageUrl).href).slice(0, limit);
}

// ------------------------------------------------------------------ frilägg

let removeBackground = null;
async function loadCutout() {
  try {
    ({ removeBackground } = await import('@imgly/background-removal-node'));
    return true;
  } catch {
    return false;
  }
}

async function cutout(srcFile, outFile) {
  const blob = await removeBackground(`file://${srcFile}`, { output: { format: 'image/png' } });
  fs.writeFileSync(outFile, Buffer.from(await blob.arrayBuffer()));
}

// ------------------------------------------------------------------ main

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

async function importOne({ url, category }, args, canCutout) {
  const html = await fetchText(url);
  const p = parseProduct(html, url);
  const cat = args.category || category || guessCategory(p.breadcrumb, new URL(url).pathname, p.name);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const images = [];
  const files = [];
  const sized = (u) => (/imgix\.net/.test(u) ? `${u.split('?')[0]}?w=900&fit=max&fm=jpg&q=80` : u);
  for (const [i, imgUrlStr0] of p.imageUrls.slice(0, 6).entries()) {
    const imgUrlStr = sized(imgUrlStr0);
    const tmp = path.join(OUT_DIR, `${p.id}-${i + 1}.tmp`);
    try {
      const type = await download(imgUrlStr, tmp);
      const ext = EXT[type.split(';')[0]] || path.extname(new URL(imgUrlStr).pathname).slice(1) || 'jpg';
      const file = path.join(OUT_DIR, `${p.id}-${i + 1}.${ext}`);
      fs.renameSync(tmp, file);
      files.push(file);
      images.push(`${PUBLIC_PREFIX}/${path.basename(file)}`);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      console.warn(`  ! ${e.message}`);
    }
  }
  if (!images.length) throw new Error('Inga bilder kunde laddas ner');

  // tryOnImage: befintlig frilagd PNG, annars automatisk friläggning av den bild som
  // mest liknar en produktbild (ingen hud, jämn ljus bakgrund).
  const tryOnFile = path.join(OUT_DIR, `${p.id}-tryon.png`);
  let tryOnImage = fs.existsSync(tryOnFile) ? `${PUBLIC_PREFIX}/${p.id}-tryon.png` : null;
  const accessory = ['bags', 'shoes', 'accessories'].includes(cat);
  const stats = [];
  for (const f of files) {
    try { stats.push({ f, ...(await classify(f)) }); } catch { /* hoppa över */ }
  }
  stats.sort((a, b) => a.score - b.score);
  if (process.env.GT_DEBUG) console.log(`  bilder: ${stats.map((x) => `${path.basename(x.f)} hud=${x.skin.toFixed(2)} kant=${x.borderStd.toFixed(0)}`).join(' | ')}`);
  const pack = stats[0];
  let anchorsOut = null;
  if (!tryOnImage && pack && pack.skin < 0.06 && pack.borderStd < 18) {
    // ljusa plagg mot ljus bakgrund: försök igen med allt lägre tolerans
    for (const tolerance of [26, 14, 8, 5]) {
      try {
        await cutoutBg(pack.f, tryOnFile, { tolerance });
        tryOnImage = `${PUBLIC_PREFIX}/${p.id}-tryon.png`;
        break;
      } catch (e) {
        if (tolerance === 5) console.warn(`  ! friläggning: ${e.message}`);
      }
    }
  }
  if (!tryOnImage && canCutout) {
    try {
      await cutout(pack?.f ?? files[0], tryOnFile);
      tryOnImage = `${PUBLIC_PREFIX}/${p.id}-tryon.png`;
    } catch (e) {
      console.warn(`  ! friläggning misslyckades: ${e.message}`);
    }
  }
  const tType = { tops: 'upper', outerwear: 'upper', jeans: 'lower', trousers: 'lower', skirts: 'lower', dresses: 'full' }[cat];
  if (tryOnImage && tType) {
    try { anchorsOut = await estimateAnchors(tryOnFile, tType, cat === 'outerwear' ? 'outer' : cat === 'skirts' ? 'skirt' : ''); } catch { /* standardankare */ }
  }
  // modellfoton (mest hud) blir kampanjbilder och inramade foton
  const modelPhotos = stats.filter((x) => x.skin > 0.05).sort((a, b) => b.skin - a.skin).map((x) => `${PUBLIC_PREFIX}/${path.basename(x.f)}`);
  // panelens bildordning: modellfoton först, produktbilden sist
  images.sort((a, b) => (modelPhotos.includes(b) ? 1 : 0) - (modelPhotos.includes(a) ? 1 : 0));

  const entry = {
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    category: cat,
    colors: p.colors.length ? p.colors : [],
    sizes: p.sizes.length ? p.sizes : [],
    images,
    tryOnImage,
    productUrl: p.productUrl,
  };
  if (!tryOnImage && !accessory) entry.tryOnType = 'none';
  if (anchorsOut) entry.tryOnAnchors = anchorsOut;
  if (p.material) entry.material = p.material;
  Object.defineProperty(entry, 'modelPhotos', { value: modelPhotos, enumerable: false });
  return entry;
}

/** Skriver ut en sidas struktur – för att anpassa importen när sajten ändras. */
function diagnose(html, url) {
  if (/\.(txt|xml)(\?|$)/.test(url)) {
    console.log(`[diag] ${url} (${html.length} tecken):\n${html.slice(0, 4000)}`);
    return;
  }
  const nodes = extractJsonLd(html);
  const title = (html.match(/<title>([^<]*)/i) || [])[1];
  const links = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(decode(m[1]), url).href; } catch { return null; } }).filter((u) => u && u.includes('ginatricot')))];
  const imgs = [...new Set([...html.matchAll(/https?:\/\/[^"'\s)]+\.(?:jpe?g|png|webp|avif)/gi)].map((m) => new URL(m[0]).host))];
  console.log(`[diag] ${url} – ${html.length} tecken, titel: ${title}`);
  console.log(`[diag] JSON-LD-typer: ${nodes.map((n) => typeOf(n).join('+')).join(', ') || 'inga'}`);
  const prod = nodes.find((n) => typeOf(n).some((t) => /Product/.test(t)));
  if (prod) console.log(`[diag] Product-JSON-LD: ${JSON.stringify(prod).slice(0, 2500)}`);
  for (const m of ['og:title', 'og:image', 'og:type', 'product:price:amount', 'product:price:currency', 'description']) console.log(`[diag] meta ${m}: ${meta(html, m)}`);
  console.log(`[diag] __NEXT_DATA__: ${html.includes('__NEXT_DATA__')}, bildvärdar: ${imgs.join(', ')}`);
  console.log(`[diag] ${links.length} interna länkar, t.ex.:\n  ${links.slice(0, 120).join('\n  ')}`);
  const imgUrls = [...new Set([...html.matchAll(/https?:\/\/ginatricotpc\.imgix\.net\/[^"'\s)\\]+/gi)].map((m) => m[0]))];
  console.log(`[diag] ${imgUrls.length} produktbilder, t.ex.:\n  ${imgUrls.slice(0, 12).join('\n  ')}`);
  const i = html.indexOf('ginatricotpc.imgix.net');
  if (i > 0) console.log(`[diag] utdrag runt första produktbilden:\n${html.slice(Math.max(0, i - 1500), i + 400).replace(/\s+/g, ' ')}`);
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));

/**
 * Produkt-URL:er från sajtens sitemap (den sanktionerade vägen enligt robots.txt).
 * Följer sitemap-index och returnerar produktsidor.
 */
export async function productUrlsFromSitemap(indexUrl, { verbose = false } = {}) {
  const xml = await fetchText(indexUrl);
  let children = xml.includes('<sitemapindex') ? locs(xml) : [];
  if (verbose) console.log(`[sitemap] ${indexUrl}: ${children.length} under-sitemaps\n  ${children.slice(0, 30).join('\n  ')}`);
  let pages = children.length ? [] : locs(xml);
  if (verbose && pages.length) {
    const depth = (u) => new URL(u).pathname.split('/').filter(Boolean).length;
    const productish = pages.filter((u) => /\d{4,}/.test(new URL(u).pathname));
    console.log(`[sitemap] ${pages.length} sidor, ${productish.length} med artikelnummer. Djupast:\n  ${[...pages].sort((x, y) => depth(y) - depth(x)).slice(0, 15).join('\n  ')}`);
    console.log(`[sitemap] med nummer:\n  ${productish.slice(0, 15).join('\n  ')}`);
  }
  const productMaps = children.filter((u) => /product|produkt|pdp|article/i.test(u));
  for (const u of (productMaps.length ? productMaps : children).slice(0, 6)) {
    try {
      const sub = locs(await fetchText(u));
      if (verbose) console.log(`[sitemap] ${u}: ${sub.length} adresser, t.ex.\n  ${sub.slice(0, 15).join('\n  ')}`);
      pages.push(...sub);
    } catch (e) {
      console.log(`[sitemap] ${u}: ${e.message}`);
    }
  }
  return pages;
}

/** Vilken butikskategori en produkt-URL hör till (svenska URL-delar på ginatricot.com). */
const URL_CATEGORIES = [
  ['jeans', /\/klader\/jeans\//],
  ['dresses', /\/klader\/kl[aä]nningar(jumpsuits)?\//],
  ['skirts', /\/klader\/kjolar\//],
  ['outerwear', /\/klader\/(coatsjackets|jackor|kappor|ytterkl[aä]der|blazers?|kavajer|jackor-kappor|rockar)[/-]/],
  ['tops', /\/klader\/(toppar|tr[oö]jor|blusarskjortor|skjortor|blusar|skjortor-blusar|t-shirts|linnen)[/-]/],
  ['bags', /\/accessoarer\/v[aä]skor(planbocker)?\//],
  ['shoes', /\/accessoarer\/skor\//],
];
const EXCLUDE = /young|miss-y|underkl|badkl|strumpor|pyjamas|sovplagg|slippers|tofflor/;

const pathOf = (u) => {
  try { return decodeURIComponent(new URL(u).pathname).toLowerCase(); } catch { return ''; }
};
/** Produktsidor slutar med ett artikelnummer, t.ex. .../straight-jeans-213456789 */
const isProductUrl = (u) => /-\d{6,}$/.test(pathOf(u));

function categoryOfUrl(u) {
  const p = pathOf(u);
  if (!isProductUrl(u) || EXCLUDE.test(p)) return null;
  return URL_CATEGORIES.find(([, re]) => re.test(p))?.[0] ?? null;
}

/**
 * Importerar enligt en plan, t.ex. "tops:5,jeans:4,dresses:4,outerwear:4,skirts:2,bags:2,shoes:2".
 * Väljer olika modeller (inte färgvarianter av samma plagg) ur sitemapen.
 */
async function importFromPlan(sitemapUrl, planStr) {
  const plan = Object.fromEntries(planStr.split(',').map((kv) => kv.split(':')).map(([k, v]) => [k.trim(), Number(v) || 0]));
  const pages = await productUrlsFromSitemap(sitemapUrl);
  console.log(`[import] sitemap: ${pages.length} adresser, ${pages.filter(isProductUrl).length} produktsidor`);
  const freq = {};
  for (const u of pages.filter(isProductUrl)) {
    const k = pathOf(u).split('/').slice(2, 4).join('/');
    freq[k] = (freq[k] || 0) + 1;
  }
  console.log(`[import] vanligaste sökvägar: ${Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  const picked = {};
  const seenStyle = new Set();
  for (const u of pages) {
    const cat = categoryOfUrl(u);
    if (!cat || !plan[cat]) continue;
    const slug = pathOf(u).split('/').pop() || '';
    const style = slug.replace(/-\d+$/, '');
    if (seenStyle.has(style)) continue;
    // reservlista: dubbelt så många kandidater som behövs (vissa sidor kan sakna bilder)
    if ((picked[cat] ??= []).length >= plan[cat] * 2) continue;
    seenStyle.add(style);
    picked[cat].push(u);
  }
  const out = [];
  const media = [];
  console.log(`[import] kandidater: ${Object.entries(picked).map(([k, v]) => `${k}=${v.length}`).join(', ')}`);
  for (const [cat, urls] of Object.entries(picked)) {
    let ok = 0;
    for (const url of urls) {
      if (ok >= plan[cat]) break;
      try {
        const e = await importOne({ url, category: cat }, { category: null }, false);
        out.push(e);
        media.push(...e.modelPhotos.slice(0, 1));
        ok++;
        console.log(`[import] ✓ ${cat}: ${e.name} – ${e.price} ${e.currency}, ${e.images.length} bilder${e.tryOnImage ? ', frilagd' : ', ingen friläggning'}`);
      } catch (err) {
        console.log(`[import] ✗ ${url}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  if (!out.length) {
    console.log('[import] inga produkter importerades – platshållarna behålls');
    return;
  }
  fs.writeFileSync(DATA, JSON.stringify(out, null, 2) + '\n');
  // riktiga modellfoton till skärmar och tavlor
  const uniq = [...new Set(media)];
  fs.writeFileSync(path.join(ROOT, 'data', 'media.json'), JSON.stringify({ campaign: uniq.slice(0, 6), photos: uniq.slice(6, 14).length ? uniq.slice(6, 14) : uniq.slice(0, 8) }, null, 2) + '\n');
  console.log(`[import] skrev ${out.length} riktiga produkter och ${uniq.length} modellfoton`);
}

/** Läge för byggservern (t.ex. Railway): styrs av miljövariabler och fäller aldrig bygget. */
async function fromEnv() {
  if (process.env.GT_IMPORT_PLAN && process.env.GT_SITEMAP) {
    try {
      await importFromPlan(process.env.GT_SITEMAP, process.env.GT_IMPORT_PLAN);
    } catch (e) {
      console.log(`[import] avbrutet: ${e.message} – platshållarna behålls`);
    }
    return;
  }
  if (process.env.GT_SITEMAP) {
    try {
      const pages = await productUrlsFromSitemap(process.env.GT_SITEMAP, { verbose: true });
      const withNum = pages.filter((u) => /\d{4,}/.test(new URL(u).pathname));
      const sample = (withNum.length ? withNum : pages.filter((u) => /\/se\//.test(u)).sort((x, y) => y.length - x.length)).slice(0, 2);
      for (const u of sample) diagnose(await fetchText(u), u);
    } catch (e) {
      console.log(`[sitemap] fel: ${e.message}`);
    }
  }
  const discover = process.env.GT_DISCOVER;
  const cats = (process.env.GT_IMPORT || '').split(/[\s,]+/).filter(Boolean);
  if (!discover && !cats.length) return;
  try {
    for (const u of (discover || '').split(/[\s,]+/).filter(Boolean)) diagnose(await fetchText(u), u);
    if (!cats.length) return;
    const limit = Number(process.env.GT_IMPORT_LIMIT) || 4;
    const urls = [];
    for (const cu of cats) {
      const [catOverride, url] = cu.includes('=') ? cu.split('=') : [null, cu];
      const html = await fetchText(url);
      const links = productLinksFromCategory(html, url, limit);
      console.log(`[import] ${url}: ${links.length} produktlänkar`);
      if (!links.length) diagnose(html, url);
      links.forEach((l) => urls.push({ url: l, category: catOverride || guessCategory(new URL(url).pathname) }));
    }
    const canCutout = process.env.GT_CUTOUT === '1' && (await loadCutout());
    const out = [];
    for (const item of urls) {
      try {
        const e = await importOne(item, { category: null }, canCutout);
        out.push(e);
        console.log(`[import] ✓ ${e.name} (${e.category}) ${e.images.length} bilder${e.tryOnImage ? ' + tryOn' : ''}`);
      } catch (e) {
        console.log(`[import] ✗ ${item.url}: ${e.message}`);
        if (process.env.GT_DEBUG) diagnose(await fetchText(item.url).catch(() => ''), item.url);
      }
    }
    if (out.length) {
      fs.writeFileSync(DATA, JSON.stringify(out, null, 2) + '\n');
      console.log(`[import] skrev ${out.length} riktiga produkter till data/products.json`);
    } else console.log('[import] inga produkter importerades – platshållarna behålls');
  } catch (e) {
    console.log(`[import] avbrutet: ${e.message} – platshållarna behålls`);
  }
}

async function main() {
  if (process.argv.includes('--from-env')) return fromEnv();
  const args = parseArgs(process.argv.slice(2));
  for (const cu of args.categoryUrls) {
    console.log(`Kategorisida: ${cu}`);
    const html = await fetchText(cu);
    const links = productLinksFromCategory(html, cu, args.limit);
    console.log(`  hittade ${links.length} produktlänkar`);
    const cat = args.category || guessCategory(new URL(cu).pathname);
    links.forEach((url) => args.urls.push({ url, category: cat }));
  }
  if (!args.urls.length) {
    console.error('Ange produkter med --url, --urls eller --category-url (se --help).');
    process.exit(1);
  }
  const canCutout = args.cutout && (await loadCutout());
  if (args.cutout && !canCutout) {
    console.log('Info: @imgly/background-removal-node saknas – tryOnImage skapas inte automatiskt.');
  }

  const existing = args.append && fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : [];
  const byId = new Map(existing.map((p) => [p.id, p]));
  let ok = 0;
  for (const item of args.urls) {
    process.stdout.write(`→ ${item.url}\n`);
    try {
      const entry = await importOne(item, args, canCutout);
      byId.set(entry.id, entry);
      ok++;
      console.log(`  ✓ ${entry.name} (${entry.category}, ${entry.price} ${entry.currency}, ${entry.images.length} bilder${entry.tryOnImage ? ', tryOn' : ''})`);
    } catch (e) {
      console.warn(`  ✗ ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 600)); // var snäll mot servern
  }
  if (!ok) {
    console.error('Inga produkter importerades – products.json lämnades orörd.');
    process.exit(1);
  }
  fs.writeFileSync(DATA, JSON.stringify([...byId.values()], null, 2) + '\n');
  console.log(`\nSkrev ${byId.size} produkter till ${path.relative(ROOT, DATA)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
