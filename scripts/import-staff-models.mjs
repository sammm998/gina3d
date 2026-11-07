// Hämtar realistiska människomodeller och rörelsefångade animationer från
// Microsoft Rocketbox (MIT-licens) och konverterar dem till assets/models/staff-*.glb.
//   npm run staff-models
// Källfilerna cachas i .cache/rocketbox (ingår inte i git).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');
const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/';
const CACHE = path.resolve('.cache/rocketbox');
const OUT = path.resolve('assets/models');

/** Vem som är vem: personalens id → [Rocketbox-avatar, texturprefix]. */
const CAST = {
  emma: ['Female_Adult_02', 'f002'], // vit blus, jeanskjol
  maja: ['Female_Adult_07', 'f007'], // mörk kavaj, jeans
  sara: ['Female_Adult_11', 'f011'], // brun klänning
  ella: ['Female_Adult_08', 'f008'], // grått linne, jeans
  linnea: ['Female_Adult_14', 'f017'], // grå kavaj
  mike: ['Male_Adult_09', 'm017'],
  alva: ['Female_Adult_09', 'f009'], // värdinna i Gina Lounge // mörkblå t-shirt, jeans
  noah: ['Male_Adult_08', 'm014'], // ljusblå skjorta
};
/** Kunder som strosar runt i butiken (assets/models/shopper-*.glb). */
const SHOPPERS = {
  1: ['Female_Adult_01', 'f001'], // rosa topp, jeans
  2: ['Female_Adult_05', 'f005'], // rosa jacka
  3: ['Female_Adult_17', 'f006'], // grön t-shirt
  4: ['Male_Adult_04', 'm006'], // jacka, chinos
};
/** Catwalkmodeller i Gina Lounge (assets/models/model-*.glb). */
const RUNWAY = {
  1: ['Female_Party_01', 'f010'], // blond
  2: ['Female_Adult_13', 'f019'], // blond
  3: ['Female_Adult_04', 'f004'], // blond
  4: ['Female_Adult_15', 'f018'], // brunett
  5: ['Female_Adult_12', 'f012'], // brunett
};
const ANIM = 'Assets/Animations/';
const anims = (g, shopper) => shopper === 'runway'
  ? {
      // catwalk: självsäker modellgång, poserar vid slutet av catwalken
      walk: `${ANIM}all_animations_max_motextr_xy/f_walk_self-assured.max.fbx`,
      idle: `${ANIM}all_animations_max_motextr_static/f_idle_neutral_04.max.fbx`,
      talk: `${ANIM}all_animations_max_motextr_static/f_idle_look_around_02.max.fbx`,
    }
  : shopper
  ? {
      // kunder: lugn promenad och "titta runt" när de står still
      walk: `${ANIM}all_animations_max_motextr_xy/${g}_walk_stroll_01.max.fbx`,
      idle: `${ANIM}all_animations_max_motextr_static/${g}_idle_look_around_01.max.fbx`,
      talk: `${ANIM}all_animations_max_motextr_static/${g}_idle_neutral_01.max.fbx`,
    }
  : {
      walk: `${ANIM}all_animations_max_motextr_xy/${g}_walk_neutral_01.max.fbx`,
      idle: `${ANIM}all_animations_max_motextr_static/${g}_idle_neutral_01.max.fbx`,
      talk: `${ANIM}all_animations_max_motextr_static/${g}_gestic_talk_relaxed_01.max.fbx`,
    };

async function fetchTo(rel) {
  const file = path.join(CACHE, rel);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return true;
  const res = await fetch(RAW + rel.split('/').map(encodeURIComponent).join('/'));
  if (!res.ok) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('Hämtade', rel);
  return true;
}

const only = process.argv.slice(2);
const specs = [];
const jobs = [
  ...Object.entries(CAST).map(([id, v]) => [`staff-${id}`, ...v, false]),
  ...Object.entries(SHOPPERS).map(([id, v]) => [`shopper-${id}`, ...v, true]),
  ...Object.entries(RUNWAY).map(([id, v]) => [`model-${id}`, ...v, 'runway']),
];
for (const [name, av, code, shopper] of jobs) {
  if (only.length && !only.some((o) => name.endsWith(o))) continue;
  const g = av.startsWith('Male') ? 'm' : 'f';
  const dir = `Assets/Avatars/Adults/${av}/`;
  if (!(await fetchTo(`${dir}Export/${av}.fbx`))) throw new Error(`Saknar ${av}`);
  for (const t of ['body_color', 'body_normal', 'head_color', 'head_normal', 'opacity_color']) {
    if (!(await fetchTo(`${dir}Textures/${code}_${t}.tga`))) throw new Error(`Saknar textur ${code}_${t}`);
  }
  const a = anims(g, shopper);
  for (const f of Object.values(a)) if (!(await fetchTo(f))) throw new Error(`Saknar ${f}`);
  specs.push({
    name,
    avatar: `/.cache/rocketbox/${dir}Export/${av}.fbx`,
    walk: `/.cache/rocketbox/${a.walk}`,
    idle: `/.cache/rocketbox/${a.idle}`,
    talk: `/.cache/rocketbox/${a.talk}`,
  });
}

fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Fel:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('Konsol:', m.text().slice(0, 200)));
  await page.goto(`http://localhost:${server.config.server.port}/tools/rocketbox.html`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  for (const s of specs) {
    const [m] = await page.evaluate((spec) => window.__convert([spec]), s);
    fs.writeFileSync(path.join(OUT, `${m.name}.glb`), Buffer.from(m.base64, 'base64'));
    console.log(`Sparade assets/models/${m.name}.glb (${(m.size / 1024).toFixed(0)} kB, gång ${m.walkSpeed} m/s)`);
  }
} finally {
  await browser.close();
  await server.close();
}
