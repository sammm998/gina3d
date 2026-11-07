import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Serverar projektets rotmappar /assets och /data (samt MediaPipe-wasm från
 * node_modules) i dev-läge och kopierar dem till dist/ vid build.
 * På så vis ligger logotyp, produktbilder och products.json i tydliga mappar
 * i projektroten i stället för gömda i public/.
 */
const STATIC_DIRS = {
  '/assets/': path.resolve('assets'),
  '/data/': path.resolve('data'),
  '/mediapipe/wasm/': path.resolve('node_modules/@mediapipe/tasks-vision/wasm'),
};

const MIME = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream',
};

function staticRootDirs() {
  return {
    name: 'static-root-dirs',
    configureServer(server) {
      // personalchatten i dev-läge (samma hanterare som i produktion)
      server.middlewares.use('/api/chat', async (req, res) => {
        // laddas vid körning (inte buntad i konfigurationen)
        const { handleChat } = await import(/* @vite-ignore */ pathToFileURL(path.resolve('server/chat.mjs')).href);
        handleChat(req, res);
      });
      server.middlewares.use('/api/voice', async (req, res) => {
        const { handleVoice } = await import(/* @vite-ignore */ pathToFileURL(path.resolve('server/chat.mjs')).href);
        handleVoice(req, res);
      });
      // katalog och kassa i dev-läge
      let shop = null;
      const shopHandler = async (req, res) => {
        if (!shop) {
          process.env.GT_CRAWL ??= '0'; // ingen bakgrundscrawl i dev
          shop = await import(/* @vite-ignore */ pathToFileURL(path.resolve('server/shop.mjs')).href);
          shop.initShop(path.resolve('data'));
        }
        req.url = req.originalUrl;
        shop.handleShop(req, res);
      };
      server.middlewares.use('/api/catalog', shopHandler);
      server.middlewares.use('/api/checkout', shopHandler);
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
          if (!url.startsWith(prefix)) continue;
          const file = path.join(dir, url.slice(prefix.length));
          if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            return res.end('Not found');
          }
          res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          return fs.createReadStream(file).pipe(res);
        }
        next();
      });
    },
    closeBundle() {
      for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
        if (!fs.existsSync(dir)) continue;
        fs.cpSync(dir, path.join(path.resolve('dist'), prefix), { recursive: true });
      }
    },
  };
}

export default defineConfig(async () => {
  const plugins = [react(), staticRootDirs()];
  if (process.env.HTTPS) {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }
  return {
    plugins,
    // Byggda JS/CSS-filer hamnar i dist/_app så att de inte krockar med /assets.
    build: { assetsDir: '_app', chunkSizeWarningLimit: 1600 },
    server: { port: 5173 },
  };
});
