// Bygger egna .glb-modeller (butikspersonal) och sparar dem i assets/models/.
//   npm run models
// Startar en tillfällig Vite-server, öppnar tools/modelgen.html i Chromium
// (Playwright) och sparar modellerna som exporteras där.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

import { createRequire } from 'node:module';
// Playwright kan vara installerat globalt (t.ex. i CI-/molnmiljöer) – require hittar det.
const { chromium } = createRequire(import.meta.url)('playwright');
const out = path.resolve('assets/models');
fs.mkdirSync(out, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = `http://localhost:${server.config.server.port}/tools/modelgen.html`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('Fel i generatorn:', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__buildModels === 'function', null, { timeout: 60000 });
  const models = await page.evaluate(() => window.__buildModels());
  for (const m of models) {
    const file = path.join(out, `${m.name}.glb`);
    fs.writeFileSync(file, Buffer.from(m.base64, 'base64'));
    console.log(`Sparade ${path.relative(process.cwd(), file)} (${(m.size / 1024).toFixed(0)} kB)`);
  }
} finally {
  await browser.close();
  await server.close();
}
