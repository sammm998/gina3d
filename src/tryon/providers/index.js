/**
 * Adapter för virtuell provning.
 *
 * Alla provningslägen implementerar samma gränssnitt, så att den inbyggda
 * 2D-överlagringen senare kan bytas mot (eller kompletteras med) en extern
 * virtual try-on-tjänst för mer realistiska resultat.
 *
 * @typedef {Object} TryOnRequest
 * @property {HTMLCanvasElement|ImageBitmap|HTMLImageElement} person  bild på personen
 * @property {Object} product        produkt från products.json
 * @property {HTMLImageElement} garmentImage  produktens tryOnImage (inläst)
 * @property {Object} [adjust]       { scale, offsetX, offsetY } från reglagen
 *
 * @typedef {Object} TryOnResult
 * @property {Blob|HTMLCanvasElement|HTMLImageElement} image  färdig bild att visa
 * @property {string} [note]         ev. text att visa för användaren
 *
 * @typedef {Object} TryOnProvider
 * @property {string}  id
 * @property {string}  name                 visas i gränssnittet
 * @property {boolean} realtime             true = kan följa videoström i realtid
 * @property {boolean} sendsImagesToServer  true = bilder skickas till extern server
 *                                          (gränssnittet kräver då uttryckligt samtycke)
 * @property {string}  description          ärlig beskrivning av vad läget gör
 * @property {(req: TryOnRequest) => Promise<TryOnResult>} render
 */
import { localOverlayProvider } from './localOverlay.js';
import { createExternalProvider } from './external.js';

const providers = [localOverlayProvider];

// En extern tjänst aktiveras bara om en endpoint konfigurerats, t.ex. i .env.local:
//   VITE_TRYON_ENDPOINT=https://din-tjanst.example.com/tryon
const endpoint = import.meta.env?.VITE_TRYON_ENDPOINT;
if (endpoint) providers.push(createExternalProvider({ endpoint, name: import.meta.env.VITE_TRYON_NAME || 'Extern provning' }));

export function listProviders() {
  return providers;
}

/** Registrera en egen provider vid start, t.ex. från main.jsx. */
export function registerProvider(p) {
  if (!providers.find((x) => x.id === p.id)) providers.push(p);
}
