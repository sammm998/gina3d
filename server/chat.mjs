/**
 * Chatt med butikspersonalen: POST /api/chat
 *
 * Med ANTHROPIC_API_KEY svarar Claude (Claude Opus 5.5) som personal och kan
 * söka i hela sortimentet, hämta en produkt live från ginatricot.com och visa
 * produktkort. Utan nyckel svarar en enkel sökning i samma katalog.
 *
 * Katalogen:
 *   data/products.json  – produkterna som finns i den virtuella butiken (fullständiga)
 *   data/catalog.json   – hela sortimentet från sajtens sitemap (namn, kategori, länk)
 * Produktdetaljer (pris, färg, material, bilder) hämtas live från produktsidan
 * och cachas en timme.
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseProduct } from '../scripts/import-ginatricot.mjs';

const MODEL = process.env.CHAT_MODEL || 'claude-opus-5-5';
const MAX_HISTORY = 40;
const UA = 'Mozilla/5.0 (compatible; gina3d-virtual-store/1.0)';

// ------------------------------------------------------------------ katalog
let store = []; // produkter i butiken
let catalog = []; // hela sortimentet
let dataDir = null;

export function initChat(dir) {
  dataDir = dir;
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      return [];
    }
  };
  store = read('products.json');
  catalog = read('catalog.json');
  console.log(`Chatt: ${store.length} produkter i butiken, ${catalog.length} i sortimentet, ${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'enkel sökning (ingen ANTHROPIC_API_KEY)'}`);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

/** Svenska sökord -> kategori/engelska termer i produktnamnen. */
const SYNONYMS = {
  klanning: ['dress', 'dresses'], klanningar: ['dress', 'dresses'], kjol: ['skirt', 'skirts'], byxor: ['trousers', 'pants'],
  jeans: ['jeans', 'denim'], topp: ['top', 'tops'], toppar: ['top', 'tops'], trojor: ['knit', 'sweater', 'knitwear'], troja: ['sweater', 'knit'],
  stickat: ['knit', 'knitted'], kofta: ['cardigan'], jacka: ['jacket'], kappa: ['coat'], ytterklader: ['coat', 'jacket', 'outerwear'],
  vaska: ['bag', 'bags'], vaskor: ['bag', 'bags'], skor: ['shoes', 'sandals', 'heels', 'boots', 'sneakers'], blus: ['blouse'], skjorta: ['shirt'],
  svart: ['black'], vit: ['white'], beige: ['beige'], bla: ['blue'], rod: ['red'], gron: ['green'], rosa: ['pink'], gra: ['grey'], brun: ['brown'],
  fest: ['party', 'sequin', 'satin'], basic: ['basic'], kostym: ['tailored', 'suit'], linne: ['tank', 'singlet'],
};

function expand(q) {
  const out = new Set();
  for (const t of tokens(q)) {
    out.add(t);
    for (const s of SYNONYMS[t] ?? []) out.add(s);
  }
  return [...out];
}

function scoreText(text, terms) {
  const t = norm(text);
  return terms.reduce((a, term) => a + (t.includes(term) ? (term.length > 3 ? 2 : 1) : 0), 0);
}

export function searchProducts({ query = '', category = 'any', max_price = 0, only_in_store = false, limit = 8 }) {
  const terms = expand(query);
  const results = [];
  for (const p of store) {
    if (category !== 'any' && p.category !== category) continue;
    if (max_price > 0 && p.price > max_price) continue;
    const s = scoreText(`${p.name} ${p.category} ${(p.colors || []).join(' ')} ${p.material || ''}`, terms) + 1.5;
    if (terms.length && s <= 1.5) continue;
    results.push({ s, item: { id: p.id, name: p.name, category: p.category, price: p.price, currency: p.currency, colors: p.colors, in_store: true, url: p.productUrl } });
  }
  if (!only_in_store) {
    for (const c of catalog) {
      if (category !== 'any' && c.category !== category) continue;
      const s = scoreText(`${c.name} ${c.path}`, terms);
      if (!s) continue;
      results.push({ s, item: { id: c.id, name: c.name, category: c.category, in_store: false, url: c.url } });
    }
  }
  results.sort((a, b) => b.s - a.s);
  const seen = new Set();
  return results.filter((r) => !seen.has(r.item.url) && seen.add(r.item.url)).slice(0, limit).map((r) => r.item);
}

// ------------------------------------------------------------------ produktdetaljer (live)
const detailCache = new Map();

export async function productDetails(ref) {
  const inStore = store.find((p) => p.id === ref || p.productUrl === ref);
  if (inStore) {
    return {
      id: inStore.id, name: inStore.name, price: inStore.price, currency: inStore.currency, colors: inStore.colors,
      sizes: inStore.sizes, material: inStore.material ?? null, image: inStore.images?.[0] ?? null, url: inStore.productUrl, in_store: true,
    };
  }
  const c = catalog.find((x) => x.id === ref || x.url === ref);
  const url = c?.url ?? ref;
  if (!/^https:\/\/www\.ginatricot\.com\//.test(url)) return { error: 'Okänd produkt' };
  const hit = detailCache.get(url);
  if (hit && Date.now() - hit.at < 3600e3) return hit.data;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'sv-SE' } });
  if (!res.ok) return { error: `Produktsidan svarade ${res.status}` };
  const p = parseProduct(await res.text(), url);
  const img = p.imageUrls.find((u) => /imgix/.test(u)) ?? p.imageUrls[0] ?? null;
  const data = {
    id: c?.id ?? p.id, name: p.name, price: p.price, currency: p.currency, colors: p.colors, sizes: p.sizes,
    material: p.material, image: img ? `${img.split('?')[0]}?w=480&fit=max&auto=format` : null, url, in_store: false,
  };
  detailCache.set(url, { at: Date.now(), data });
  return data;
}

// ------------------------------------------------------------------ Claude
const TOOLS = [
  {
    name: 'search_products',
    description:
      'Söker i Gina Tricots sortiment: både plaggen som finns i den här virtuella butiken (in_store: true, med pris) och hela webbutikens sortiment (in_store: false, pris saknas tills du hämtar detaljer). Använd korta sökord, gärna på engelska som i produktnamnen (t.ex. "black wide jeans", "satin dress").',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Sökord, t.ex. "beige knitted sweater".' },
        category: {
          type: 'string',
          enum: ['any', 'tops', 'knitwear', 'trousers', 'jeans', 'dresses', 'skirts', 'outerwear', 'bags', 'shoes'],
          description: 'Begränsa till en kategori, eller "any".',
        },
        max_price: { type: 'number', description: 'Maxpris i SEK för plagg i butiken; 0 = ingen gräns.' },
        only_in_store: { type: 'boolean', description: 'true = bara plagg som finns i den virtuella butiken.' },
      },
      required: ['query', 'category', 'max_price', 'only_in_store'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_product_details',
    description: 'Hämtar aktuellt pris, färger, storlekar, material och bild för en produkt (id eller url från search_products), live från ginatricot.com.',
    input_schema: {
      type: 'object',
      properties: { ref: { type: 'string', description: 'Produktens id eller url.' } },
      required: ['ref'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'show_products',
    description: 'Visar produktkort med bild, pris och knappar för kunden i chatten. Använd när du rekommenderar specifika plagg (max 4).',
    input_schema: {
      type: 'object',
      properties: { refs: { type: 'array', items: { type: 'string' }, description: 'Id eller url för produkterna.' } },
      required: ['refs'],
      additionalProperties: false,
    },
    strict: true,
  },
];

function systemPrompt(staff) {
  return `Du är ${staff || 'en medarbetare'}, butikspersonal i Gina Tricots virtuella 3D-butik. Du chattar med en kund som går runt i butiken.

Butiken har tre våningar:
- Plan 1 (entréplan): entré med skyltdockor, denim, toppar, accessoarer (väskor, skor), ytterkläder, kassa och provrum med virtuell provspegel.
- Plan 2: klänningar samt fest & nyheter.
- Plan 3: tröjor & stickat samt byxor.
Rulltrapporna ligger längs högerväggen.

Så här hjälper du kunden:
- Svara på svenska, vänligt, kort och konkret, som en kunnig säljare i butik.
- Hitta plagg med verktygen. Hitta aldrig på produkter, priser, färger eller storlekar – uppgifter om ett plagg ska komma från verktygen.
- När du föreslår plagg, visa dem med show_products (högst 4). Tala om ifall plagget finns här i butiken (in_store) och på vilken våning, eller att det finns i webbutiken.
- Kunden kan lägga plagg från butiken i kundkorgen och prova dem virtuellt i provrummet (plan 1, vid kassan) med webbkamera eller egen bild – berätta gärna det när det passar.
- Frågor om beställningar, leveranser och returer: hänvisa till https://www.ginatricot.com/se/kundservice.
- Du är en AI-assistent i en virtuell butik. Om kunden frågar, säg det rakt ut. Be inte om personuppgifter.`;
}

let client = null;
const getClient = () => (client ??= new Anthropic());

function cardFor(d) {
  if (!d || d.error) return null;
  return { id: d.id, name: d.name, price: d.price ?? null, currency: d.currency ?? 'SEK', image: d.image ?? null, url: d.url, in_store: !!d.in_store };
}

async function runTool(name, input, cards) {
  if (name === 'search_products') return searchProducts(input);
  if (name === 'get_product_details') return productDetails(input.ref);
  if (name === 'show_products') {
    const refs = Array.isArray(input.refs) ? input.refs.slice(0, 4) : [];
    const found = (await Promise.all(refs.map((r) => productDetails(r).catch(() => null)))).map(cardFor).filter(Boolean);
    cards.push(...found);
    return { shown: found.map((c) => c.name) };
  }
  return { error: `Okänt verktyg ${name}` };
}

/** Validerar verktygsindata mot schemat (krävs fält + typer). */
function validInput(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || !input || typeof input !== 'object') return false;
  const props = tool.input_schema.properties;
  return tool.input_schema.required.every((k) => {
    const v = input[k];
    const t = props[k].type;
    return t === 'array' ? Array.isArray(v) : typeof v === t;
  });
}

async function claudeChat(staff, history) {
  const cards = [];
  const messages = [...history];
  for (let turn = 0; turn < 6; turn++) {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt(staff),
      tools: TOOLS,
      messages,
      output_config: { effort: 'low' }, // chatt: korta, snabba svar
      // vid ett policyavslag körs samma förfrågan om på en reservmodell
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') {
      return { reply: 'Det kan jag tyvärr inte hjälpa till med, men fråga gärna om kläder eller butiken!', cards, history: messages };
    }
    if (res.stop_reason !== 'tool_use') {
      const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { reply: reply || 'Hur kan jag hjälpa dig?', cards, history: messages };
    }
    const results = [];
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue;
      if (!validInput(b.name, b.input)) {
        results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'INVALID_INPUT: kontrollera fälten mot schemat.' });
        continue;
      }
      try {
        const out = await runTool(b.name, b.input, cards);
        results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: String(e.message || e) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Jag behöver lite mer tid på mig – kan du formulera frågan lite kortare?', cards, history: messages };
}

/** Utan API-nyckel: enkel sökning och några produktkort. */
async function simpleChat(text) {
  const hits = searchProducts({ query: text, limit: 4 });
  if (!hits.length) {
    return {
      reply: 'Jag hittade inget som matchar. Prova med plaggtyp och färg, t.ex. ”svart klänning” eller ”vida jeans”. (Personalchatten svarar med enkel sökning eftersom ingen AI-nyckel är inlagd.)',
      cards: [],
    };
  }
  const cards = (await Promise.all(hits.map((h) => productDetails(h.id).catch(() => null)))).map(cardFor).filter(Boolean);
  return { reply: `Här är några förslag som matchar ”${text}”:`, cards };
}

// ------------------------------------------------------------------ HTTP
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = (buckets.get(ip) ?? []).filter((t) => now - t < 60e3);
  b.push(now);
  buckets.set(ip, b);
  return b.length > 20;
}

function sanitizeHistory(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content)))
    .slice(-MAX_HISTORY);
}

export async function handleChat(req, res) {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST') return send(405, { error: 'POST krävs' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
  if (rateLimited(ip)) return send(429, { error: 'För många frågor på kort tid – vänta en minut.' });
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 400_000) return send(413, { error: 'För stor förfrågan' });
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return send(400, { error: 'Ogiltig JSON' });
  }
  const text = String(data.message || '').slice(0, 1000).trim();
  if (!text) return send(400, { error: 'Tomt meddelande' });
  if (!dataDir) initChat(path.resolve('data'));
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const history = [...sanitizeHistory(data.history), { role: 'user', content: text }];
      const out = await claudeChat(String(data.staff || '').slice(0, 40), history);
      return send(200, { ...out, mode: 'ai' });
    }
    return send(200, { ...(await simpleChat(text)), mode: 'search' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return send(503, { error: 'Personalen är upptagen just nu – försök igen om en stund.' });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('Chatt: ogiltig ANTHROPIC_API_KEY');
      return send(200, { ...(await simpleChat(text)), mode: 'search' });
    }
    if (e instanceof Anthropic.APIError) console.error(`Chatt: API-fel ${e.status}: ${e.message}`);
    else console.error('Chatt:', e);
    return send(500, { error: 'Något gick fel i chatten.' });
  }
}
