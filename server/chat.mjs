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
  console.log(`Chatt: ${store.length} produkter i butiken, ${catalog.length} i sortimentet, ${process.env.ANTHROPIC_API_KEY ? 'Claude' : process.env.OPENAI_API_KEY ? `OpenAI (${OPENAI_MODEL})` : 'enkel sökning (ingen AI-nyckel)'}`);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

// ------------------------------------------------------------------ sökning
// Frågan tolkas: plaggtyp (kategori) är ett krav, undertyp (t.ex. linne, kofta)
// och färg rankas. Stavfel som "byxir" tolereras. Vanliga ord ("jag vill ha")
// räknas inte, och ord matchas som hela ord – inte som delar av andra ord.

/** Ord i frågan -> kategori. */
const CATEGORY_WORDS = {
  trousers: ['byxa', 'byxor', 'brallor', 'pants', 'trousers', 'kostymbyxor', 'chinos', 'leggings', 'shorts', 'joggers', 'mjukisbyxor'],
  jeans: ['jeans', 'denim', 'jeansen'],
  tops: ['topp', 'toppar', 'toppen', 'linne', 'linnen', 'linnet', 't-shirt', 'tshirt', 't-shirts', 'tisha', 'blus', 'blusar', 'blusen', 'skjorta', 'skjortor', 'body', 'top', 'tops', 'tank', 'crop'],
  knitwear: ['troja', 'trojor', 'trojan', 'stickat', 'stickad', 'stickade', 'kofta', 'koftor', 'cardigan', 'sweatshirt', 'hoodie', 'luvtroja', 'pullover', 'jumper', 'sweater', 'polo'],
  dresses: ['klanning', 'klanningar', 'klanningen', 'dress', 'dresses', 'jumpsuit', 'festklanning', 'maxiklanning'],
  skirts: ['kjol', 'kjolar', 'kjolen', 'skirt', 'minikjol', 'midikjol'],
  outerwear: ['jacka', 'jackor', 'jackan', 'kappa', 'kappor', 'rock', 'blazer', 'blazers', 'kavaj', 'coat', 'jacket', 'trench', 'trenchcoat', 'puffer', 'dunjacka', 'vast', 'ytterklader'],
  bags: ['vaska', 'vaskor', 'bag', 'bags', 'handvaska', 'shopper', 'planbok', 'axelremsvaska'],
  shoes: ['sko', 'skor', 'sandal', 'sandaler', 'stovlar', 'stovel', 'boots', 'sneakers', 'klackar', 'klackskor', 'pumps', 'loafers', 'heels', 'ballerina', 'ballerinaskor'],
};
const WORD_CAT = Object.fromEntries(Object.entries(CATEGORY_WORDS).flatMap(([c, ws]) => ws.map((w) => [w, c])));

/** Undertyper och egenskaper -> engelska ord i produktnamnen (rankas högre). */
const NAME_WORDS = {
  linne: ['tank', 'singlet', 'cami', 'strap', 'vest', 'linne'], linnen: ['tank', 'singlet', 'cami', 'strap', 'vest'], linnet: ['tank', 'singlet', 'cami'],
  tshirt: ['tee', 't-shirt', 'tshirt'], 't-shirt': ['tee', 't-shirt', 'tshirt'], tisha: ['tee', 't-shirt'],
  blus: ['blouse'], blusar: ['blouse'], skjorta: ['shirt'], skjortor: ['shirt'], body: ['body'], crop: ['crop', 'cropped'],
  kofta: ['cardigan'], koftor: ['cardigan'], hoodie: ['hoodie', 'hood'], luvtroja: ['hoodie', 'hood'], sweatshirt: ['sweatshirt', 'sweat'],
  stickat: ['knit', 'knitted'], stickad: ['knit', 'knitted'], polo: ['polo'],
  jumpsuit: ['jumpsuit'], maxiklanning: ['maxi'], festklanning: ['party', 'sequin', 'satin'],
  shorts: ['shorts'], leggings: ['leggings'], chinos: ['chino'], kostymbyxor: ['tailored', 'suit'], joggers: ['jogger', 'sweatpants'], mjukisbyxor: ['sweatpants', 'jogger'],
  minikjol: ['mini'], midikjol: ['midi'],
  blazer: ['blazer'], kavaj: ['blazer'], kappa: ['coat'], rock: ['coat'], jacka: ['jacket'], trench: ['trench'], dunjacka: ['puffer', 'down'], puffer: ['puffer'], vast: ['vest', 'gilet'],
  sandal: ['sandal', 'sandals'], sandaler: ['sandal', 'sandals'], stovlar: ['boot', 'boots'], boots: ['boot', 'boots'], sneakers: ['sneaker', 'sneakers'], klackar: ['heel', 'heels'], pumps: ['pumps', 'heel'], loafers: ['loafer', 'loafers'], ballerina: ['ballerina', 'ballet'],
  shopper: ['shopper', 'tote'], planbok: ['wallet'],
  vida: ['wide'], vid: ['wide'], raka: ['straight'], rak: ['straight'], smala: ['slim', 'skinny'], hogmidjade: ['high', 'waist'], lag: ['low'],
  lang: ['long', 'maxi'], langa: ['long', 'maxi'], kort: ['short', 'mini', 'cropped'], korta: ['short', 'mini', 'cropped'], midi: ['midi'], maxi: ['maxi'], mini: ['mini'],
  fest: ['party', 'sequin', 'satin', 'glitter'], satin: ['satin'], spets: ['lace'], ribbad: ['rib', 'ribbed'], oversize: ['oversized', 'oversize'],
  svart: ['black'], svarta: ['black'], vit: ['white'], vita: ['white'], beige: ['beige'], bla: ['blue'], blaa: ['blue'], rod: ['red'], roda: ['red'],
  gron: ['green'], grona: ['green'], rosa: ['pink'], gra: ['grey', 'gray'], graa: ['grey', 'gray'], brun: ['brown'], bruna: ['brown'], kram: ['cream', 'offwhite'],
};
/** Undertyper som är egna plaggtyper (filtrerar strikt). Övriga ord (färg, längd, fest …) rankar bara. */
const TYPE_WORDS = new Set(['linne', 'linnen', 'linnet', 'tshirt', 't-shirt', 'tisha', 'blus', 'blusar', 'skjorta', 'skjortor', 'body', 'kofta', 'koftor', 'hoodie', 'luvtroja',
  'sweatshirt', 'polo', 'jumpsuit', 'shorts', 'leggings', 'chinos', 'joggers', 'mjukisbyxor', 'blazer', 'kavaj', 'kappa', 'rock', 'jacka', 'trench', 'dunjacka', 'puffer', 'vast',
  'sandal', 'sandaler', 'stovlar', 'boots', 'sneakers', 'klackar', 'pumps', 'loafers', 'ballerina', 'shopper', 'planbok']);
const STOP = new Set(('jag vill ha har ni du dig en ett nagra nagot nagon visa mig soker letar efter finns det som med och i pa for till garna kan hitta skulle vilka vad ar hej tack '
  + 'snalla please gillar behover kopa ska vara lite mer typ eller utan fran om den det de dom era er min mina mitt was any some show me find looking for want need hello hi').split(' '));

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Rättar stavfel mot kända ord (byxir -> byxor, trjor -> trojor). */
const KNOWN = [...new Set([...Object.keys(WORD_CAT), ...Object.keys(NAME_WORDS)])];
function correct(t) {
  if (WORD_CAT[t] || NAME_WORDS[t] || t.length < 4) return t;
  let best = t, bd = t.length >= 7 ? 2 : 1;
  for (const k of KNOWN) {
    const dd = editDistance(t, k);
    if (dd < bd || (dd === bd && best === t && dd <= (t.length >= 7 ? 2 : 1))) { best = k; bd = dd; }
  }
  return best;
}

const words = (s) => norm(s).replace(/t-shirt/g, 'tshirt').split(/[^a-z0-9]+/).filter(Boolean);

/** Tolkar en fråga: { categories, nameTerms, freeTerms }. */
export function parseQuery(q) {
  const cats = new Set(), nameTerms = new Set(), typeTerms = new Set(), free = [];
  for (const raw of words(q)) {
    if (STOP.has(raw) || raw.length < 2) continue;
    const t = correct(raw);
    if (WORD_CAT[t]) cats.add(WORD_CAT[t]);
    for (const n of NAME_WORDS[t] ?? []) (TYPE_WORDS.has(t) ? typeTerms : nameTerms).add(n);
    if (!WORD_CAT[t] && !NAME_WORDS[t]) free.push(t);
  }
  return { categories: [...cats], typeTerms: [...typeTerms], nameTerms: [...nameTerms], freeTerms: free };
}

const hasWord = (nameWords, term) => nameWords.some((w) => w === term || (term.length >= 4 && w.startsWith(term)));

export function searchProducts({ query = '', category = 'any', max_price = 0, only_in_store = false, limit = 8 }) {
  const q = parseQuery(query);
  const cats = category && category !== 'any' ? [category] : q.categories;
  const pool = [
    ...store.map((p) => ({ in_store: true, id: p.id, name: p.name, category: p.category, price: p.price, currency: p.currency, colors: p.colors, url: p.productUrl, text: `${p.name} ${(p.colors || []).join(' ')} ${p.material || ''}` })),
    ...(only_in_store ? [] : catalog.map((c) => ({ in_store: false, id: c.id, name: c.name, category: c.category, url: c.url, text: `${c.name} ${c.path || ''}` }))),
  ];
  const scored = [];
  for (const it of pool) {
    if (cats.length && !cats.includes(it.category)) continue;
    if (max_price > 0 && it.in_store && it.price > max_price) continue;
    const ws = words(it.text);
    const typeHit = q.typeTerms.some((t) => hasWord(ws, t));
    const nameHits = q.nameTerms.filter((t) => hasWord(ws, t)).length;
    const freeHits = q.freeTerms.filter((t) => hasWord(ws, t)).length;
    // utan kategori i frågan krävs att något ord faktiskt matchar
    if (!cats.length && !typeHit && !nameHits && !freeHits) continue;
    scored.push({ it, typeHit, s: (typeHit ? 5 : 0) + nameHits * 3 + freeHits * 2 + (it.in_store ? 0.5 : 0) });
  }
  // Frågar man efter en plaggtyp (linne, kofta, blazer …) visas bara den – om den finns
  const filtered = q.typeTerms.length && scored.some((x) => x.typeHit) ? scored.filter((x) => x.typeHit) : scored;
  filtered.sort((a, b) => b.s - a.s);
  const seen = new Set();
  return filtered
    .filter((x) => !seen.has(x.it.url) && seen.add(x.it.url))
    .slice(0, limit)
    .map(({ it }) => ({ id: it.id, name: it.name, category: it.category, in_store: it.in_store, url: it.url, ...(it.in_store ? { price: it.price, currency: it.currency, colors: it.colors } : {}) }));
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
- Visa exakt den plaggtyp kunden frågar efter: frågar kunden om byxor visar du bara byxor, om linnen bara linnen. Sätt category i search_products (byxor = trousers, jeans = jeans, linne/topp/blus/skjorta/t-shirt = tops, tröja/stickat/kofta/hoodie = knitwear, klänning = dresses, kjol = skirts, jacka/kappa/blazer = outerwear, väska = bags, skor = shoes) och sök på plaggets engelska namn (t.ex. "tank top", "wide trousers").
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

// ------------------------------------------------------------------ OpenAI
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

/**
 * Samma personal och verktyg via OpenAI (OPENAI_API_KEY). Historiken som
 * skickas tillbaka till webbläsaren innehåller bara text (frågor och svar).
 */
async function openaiChat(staff, history) {
  const cards = [];
  const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema, strict: true } }));
  const textHistory = history
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '') }))
    .filter((m) => m.content);
  const messages = [{ role: 'system', content: systemPrompt(staff) }, ...textHistory];
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, tools, temperature: 0.4, max_tokens: 900 }),
      signal: AbortSignal.timeout(45000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json?.error?.message || `OpenAI ${res.status}`), { status: res.status, openai: true });
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error('Tomt svar från OpenAI');
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      const reply = (msg.content || '').trim() || 'Hur kan jag hjälpa dig?';
      return { reply, cards, history: [...textHistory, { role: 'assistant', content: reply }] };
    }
    for (const call of msg.tool_calls) {
      let out;
      try {
        const input = JSON.parse(call.function.arguments || '{}');
        out = validInput(call.function.name, input) ? await runTool(call.function.name, input, cards) : { error: 'INVALID_INPUT' };
      } catch (e) {
        out = { error: String(e.message || e) };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  return { reply: 'Jag behöver lite mer tid på mig – kan du formulera frågan lite kortare?', cards, history: textHistory };
}

/** Utan API-nyckel: enkel sökning och några produktkort. */
const CAT_SV = { trousers: 'byxor', jeans: 'jeans', tops: 'toppar', knitwear: 'tröjor och stickat', dresses: 'klänningar', skirts: 'kjolar', outerwear: 'ytterkläder', bags: 'väskor', shoes: 'skor' };

async function simpleChat(text) {
  const hits = searchProducts({ query: text, limit: 6 });
  if (!hits.length) {
    return {
      reply: 'Jag hittade inget som matchar. Prova med plaggtyp och färg, t.ex. ”svart klänning” eller ”vida jeans”. ',
      cards: [],
    };
  }
  const cards = (await Promise.all(hits.map((h) => productDetails(h.id).catch(() => null)))).map(cardFor).filter(Boolean);
  const q = parseQuery(text);
  const what = q.categories.length ? q.categories.map((c) => CAT_SV[c] ?? c).join(' och ') : `”${text}”`;
  return { reply: `Här är ${what} jag hittade åt dig:`, cards };
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
    if (!process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) {
      const history = [...sanitizeHistory(data.history), { role: 'user', content: text }];
      try {
        const out = await openaiChat(String(data.staff || '').slice(0, 40), history);
        return send(200, { ...out, mode: 'ai' });
      } catch (e) {
        // AI-tjänsten svarar inte (fel nyckel, slut på krediter …) – svara med sökningen i stället
        console.error('OpenAI:', e.message);
        return send(200, { ...(await simpleChat(text)), mode: 'search' });
      }
    }
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

// ------------------------------------------------------------------ röstsamtal (OpenAI)
// POST /api/voice { audio: base64, mime, staff, voice, history }
// Tal -> text (transkribering) -> samma personal och verktyg som chatten -> tal.
const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']);

async function openaiFetch(pathname, init) {
  const res = await fetch(`https://api.openai.com/v1/${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j?.error?.message || `OpenAI ${res.status}`), { status: res.status });
  }
  return res;
}

export async function handleVoice(req, res) {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST') return send(405, { error: 'POST krävs' });
  if (!process.env.OPENAI_API_KEY) return send(503, { error: 'Röstsamtal kräver OPENAI_API_KEY på servern.' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
  if (rateLimited(ip)) return send(429, { error: 'För många frågor på kort tid – vänta en minut.' });
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8_000_000) return send(413, { error: 'Inspelningen är för lång' });
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return send(400, { error: 'Ogiltig förfrågan' });
  }
  if (!dataDir) initChat(path.resolve('data'));
  try {
    // 1) tal -> text
    const mime = /^audio\/[a-z0-9.+-]+/i.test(data.mime || '') ? data.mime.split(';')[0] : 'audio/webm';
    const ext = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[mime] || 'webm';
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(String(data.audio || ''), 'base64')], { type: mime }), `tal.${ext}`);
    form.append('model', STT_MODEL);
    form.append('language', 'sv');
    const stt = await (await openaiFetch('audio/transcriptions', { method: 'POST', body: form })).json();
    const text = String(stt.text || '').trim().slice(0, 1000);
    if (!text) return send(200, { transcript: '', reply: 'Jag hörde inte riktigt – kan du säga det igen?', cards: [], mode: 'voice' });
    // 2) samma personal och verktyg som chatten
    const staff = String(data.staff || '').slice(0, 40);
    const history = [...sanitizeHistory(data.history), { role: 'user', content: text }];
    const out = process.env.ANTHROPIC_API_KEY ? await claudeChat(staff, history) : await openaiChat(staff, history);
    // 3) text -> tal (kort och naturligt: länkar och listtecken läses inte upp)
    const spoken = out.reply.replace(/https?:\/\/\S+/g, '').replace(/[*#_`>]/g, '').slice(0, 1200);
    const voice = VOICES.has(data.voice) ? data.voice : 'coral';
    const tts = await openaiFetch('audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice, input: spoken, response_format: 'mp3', instructions: 'Tala naturlig, vänlig svenska som en glad och kunnig butiksmedarbetare i en modebutik. Lagom tempo.' }),
    });
    const audio = Buffer.from(await tts.arrayBuffer()).toString('base64');
    return send(200, { ...out, transcript: text, audio, mode: 'voice' });
  } catch (e) {
    console.error('Röst:', e.message);
    return send(502, { error: e.status === 401 ? 'OpenAI-nyckeln godkändes inte.' : 'Röstsamtalet fungerade inte just nu – skriv gärna i stället.' });
  }
}
