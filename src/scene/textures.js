import * as THREE from 'three';

/**
 * Procedurella texturer som genereras i webbläsaren (inga nedladdningar):
 * kakelgolv, ljuskäglor, text och skyltar. Allt cachas.
 */
const cache = new Map();

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Ljusgrått kakelgolv i stora plattor (80 × 80 cm). En upprepning = 4 × 4 plattor. */
export function floorTexture(maxAnisotropy = 8) {
  return cached('floor', () => {
    const size = 1024;
    const tiles = 4;
    const c = canvas(size, size);
    const g = c.getContext('2d');
    const ts = size / tiles;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        const v = 206 + Math.round((rnd() - 0.5) * 8);
        g.fillStyle = `rgb(${v},${v},${v - 3})`;
        g.fillRect(i * ts, j * ts, ts, ts);
        // svag diagonal ådring
        const grd = g.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
        grd.addColorStop(0, 'rgba(255,255,255,0.05)');
        grd.addColorStop(0.5, 'rgba(0,0,0,0.025)');
        grd.addColorStop(1, 'rgba(255,255,255,0.04)');
        g.fillStyle = grd;
        g.fillRect(i * ts, j * ts, ts, ts);
      }
    }
    // fint brus (terrazzo-känsla)
    const img = g.getImageData(0, 0, size, size);
    for (let p = 0; p < img.data.length; p += 4) {
      const n = (rnd() - 0.5) * 7;
      img.data[p] += n;
      img.data[p + 1] += n;
      img.data[p + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // fogar
    g.fillStyle = 'rgba(150,150,146,0.9)';
    for (let i = 0; i <= tiles; i++) {
      g.fillRect(i * ts - 1.5, 0, 3, size);
      g.fillRect(0, i * ts - 1.5, size, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  });
}

/** Mörkare, polerad stenplatta för gallerians golv. */
export function mallFloorTexture(maxAnisotropy = 8) {
  return cached('mallFloor', () => {
    const size = 512;
    const c = canvas(size, size);
    const g = c.getContext('2d');
    g.fillStyle = '#b9b4ab';
    g.fillRect(0, 0, size, size);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + rnd() * 70;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.5)`;
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.fillStyle = 'rgba(120,115,108,0.8)';
    g.fillRect(0, 0, size, 2);
    g.fillRect(0, 0, 2, size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  });
}

/** Radiell gradient som används för "bakade" ljuskäglor på golv och väggar. */
export function glowTexture() {
  return cached('glow', () => {
    const s = 256;
    const c = canvas(s, s);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,248,235,1)');
    grd.addColorStop(0.35, 'rgba(255,246,230,0.45)');
    grd.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Mjuk mörk skugga (för "bakad" kontaktskugga under möbler). */
export function shadowTexture() {
  return cached('shadow', () => {
    const s = 128;
    const c = canvas(s, s);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  });
}

/**
 * Text som textur, t.ex. "denim" på väggen. Använder webbsidans typsnitt
 * (Inter laddas lokalt via @fontsource) så inget hämtas från CDN.
 */
export function textTexture(text, { weight = 200, size = 220, color = '#1a1a1a', font = 'Inter Variable, Inter, Helvetica, Arial, sans-serif', padding = 40, letterSpacing = 0 } = {}) {
  return cached(`text:${text}:${weight}:${size}:${color}:${letterSpacing}`, () => {
    const measure = canvas(10, 10).getContext('2d');
    measure.font = `${weight} ${size}px ${font}`;
    if ('letterSpacing' in measure) measure.letterSpacing = `${letterSpacing}px`;
    const w = Math.ceil(measure.measureText(text).width + padding * 2);
    const h = Math.ceil(size * 1.35 + padding * 2);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.font = `${weight} ${size}px ${font}`;
    if ('letterSpacing' in g) g.letterSpacing = `${letterSpacing}px`;
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(text, padding, h / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.userData.aspect = w / h;
    return tex;
  });
}

/**
 * Läser in en SVG/bild och ritar den på en vit (eller transparent) yta.
 * Returnerar Promise<THREE.Texture> med userData.aspect. Faller tillbaka på
 * `fallbackUrl` om filen saknas.
 */
export function imageToTexture(url, { fallbackUrl, background = null, height = 512, padding = 0 } = {}) {
  const key = `img:${url}:${background}:${height}:${padding}`;
  return cached(key, () =>
    loadImage(url)
      .catch(() => (fallbackUrl ? loadImage(fallbackUrl) : Promise.reject(new Error(`Kunde inte läsa ${url}`))))
      .then((img) => {
        const aspect = (img.naturalWidth || img.width || 4) / (img.naturalHeight || img.height || 1);
        const h = height;
        const w = Math.round(h * aspect);
        const c = canvas(w + padding * 2, h + padding * 2);
        const g = c.getContext('2d');
        if (background) {
          g.fillStyle = background;
          g.fillRect(0, 0, c.width, c.height);
        }
        g.drawImage(img, padding, padding, w, h);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.userData.aspect = c.width / c.height;
        return tex;
      })
  );
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Kunde inte läsa ${url}`));
    img.src = url;
  });
}
