/**
 * Förbereder en plaggbild för AR-provningen:
 *  1. tar bort bakgrund om bilden saknar genomskinlighet (färgfyllning från kanterna)
 *  2. behåller bara den största sammanhängande delen (rester av bakgrund,
 *     skuggor och lösa pixlar försvinner)
 *  3. beskär till plagget och räknar fram ankarpunkter ur plaggets form
 *  4. underkänner bilder som inte går att prova (t.ex. kvar-lämnad bakgrund)
 *
 * Ankarpunkterna följer kroppens proportioner i stället för plaggbildens
 * kanter, så att ett kort linne blir kort och en lång tröja lång.
 */

const MAX = 640;
const cache = new WeakMap();

/** Kroppsproportioner (i förhållande till avståndet mellan axel- resp. höftleder). */
const PROP = {
  upper: 1.35, // axlar → höftleder
  full: 2.9, // axlar → knän
  lower: 2.3, // höftleder → knän
};

function largestComponent(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let best = -1, bestSize = 0;
  const sizes = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] !== -1) continue;
    let sp = 0, size = 0;
    stack[sp++] = i;
    label[i] = n;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && label[p - 1] === -1) { label[p - 1] = n; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && label[p + 1] === -1) { label[p + 1] = n; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && label[p - w] === -1) { label[p - w] = n; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && label[p + w] === -1) { label[p + w] = n; stack[sp++] = p + w; }
    }
    sizes.push(size);
    if (size > bestSize) { bestSize = size; best = n; }
    n++;
  }
  // behåll även stora delar nära plagget (t.ex. ett skärp) – men inga småbitar
  const keep = new Uint8Array(n);
  sizes.forEach((s, k) => { if (k === best || s > bestSize * 0.25) keep[k] = 1; });
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && keep[label[i]]) out[i] = 1;
  return { mask: out, size: bestSize };
}

/** Färgfyllning från kanterna för bilder utan alfakanal (enfärgad bakgrund). */
function removeBackground(d, w, h, tol = 26) {
  const edge = [];
  for (let x = 0; x < w; x += 4) edge.push((x) * 4, ((h - 1) * w + x) * 4);
  for (let y = 0; y < h; y += 4) edge.push((y * w) * 4, (y * w + w - 1) * 4);
  const med = [0, 1, 2].map((c) => edge.map((i) => d[i + c]).sort((a, b) => a - b)[edge.length >> 1]);
  const bg = new Uint8Array(w * h);
  const stack = [];
  const close = (p) => Math.abs(d[p * 4] - med[0]) + Math.abs(d[p * 4 + 1] - med[1]) + Math.abs(d[p * 4 + 2] - med[2]) < tol * 3;
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !close(p)) continue;
    bg[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (bg[p]) d[p * 4 + 3] = 0;
}

/** Bredaste sammanhängande sträcka runt mittkolumnen på rad y. */
function runAt(mask, w, y, cx) {
  let l = cx, r = cx;
  if (!mask[y * w + cx]) {
    // mitten kan vara tom (t.ex. mellan byxben) – leta närmaste fyllda pixel
    let k = 1;
    while (k < w / 2 && !mask[y * w + cx - k] && !mask[y * w + cx + k]) k++;
    if (k >= w / 2) return null;
    l = r = mask[y * w + cx - k] ? cx - k : cx + k;
  }
  while (l > 0 && mask[y * w + l - 1]) l--;
  while (r < w - 1 && mask[y * w + r + 1]) r++;
  return [l, r];
}

/**
 * @returns {{ canvas, anchors, ok: boolean, reason?: string }}
 * anchors: { left:[x,y], right:[x,y], bottomY } normaliserat mot canvas.
 */
export function prepareGarment(img, type) {
  const key = cache.get(img);
  if (key?.[type]) return key[type];
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(1, MAX / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const d = data.data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 250) opaque++;
  if (opaque > w * h * 0.97) removeBackground(d, w, h);

  const raw = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) raw[p] = d[p * 4 + 3] > 110 ? 1 : 0;
  const { mask, size } = largestComponent(raw, w, h);
  const fail = (reason) => ({ canvas: null, anchors: null, ok: false, reason });
  if (size < w * h * 0.03) return remember(img, type, fail('För liten eller tom plaggbild.'));

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) { d[p * 4 + 3] = 0; continue; }
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  // Galgkrok/upphängning överst i produktbilden: smala rader ovanför plagget tas bort
  {
    const fullW = x1 - x0 + 1;
    const rowW = (y) => {
      let l = -1, r = -1;
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; }
      return l < 0 ? 0 : r - l + 1;
    };
    let ny = y0;
    while (ny < y1 && rowW(ny) < fullW * 0.12) ny++;
    if (ny > y0 && ny - y0 < (y1 - y0) * 0.3) {
      for (let y = y0; y < ny; y++) for (let x = 0; x < w; x++) { mask[y * w + x] = 0; d[(y * w + x) * 4 + 3] = 0; }
      y0 = ny;
    }
  }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  // en nästan helt fylld rektangel = bakgrunden blev kvar
  let filled = 0;
  for (let p = 0; p < w * h; p++) filled += mask[p];
  if (filled / (bw * bh) > 0.9) return remember(img, type, fail('Bakgrunden kunde inte tas bort från bilden.'));
  const touches = (x0 <= 1) + (y0 <= 1) + (x1 >= w - 2) + (y1 >= h - 2);
  if (touches >= 3) return remember(img, type, fail('Plagget är beskuret i bilden.'));
  g.putImageData(data, 0, 0);

  // beskuren canvas med lite luft
  const pad = Math.round(Math.max(bw, bh) * 0.03);
  const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
  const cw = Math.min(w, x1 + pad + 1) - cx0, chh = Math.min(h, y1 + pad + 1) - cy0;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = chh;
  out.getContext('2d').drawImage(c, cx0, cy0, cw, chh, 0, 0, cw, chh);

  // ankare ur formen
  const mid = Math.round((x0 + x1) / 2);
  let left, right, topY, bottomY;
  if (type === 'lower') {
    // midjans bredd strax under linningen; höftlederna ligger ca halva midjebredden isär
    const yw = Math.min(y1, y0 + Math.round(bh * 0.04));
    const run = runAt(mask, w, yw, mid) ?? [x0, x1];
    const waist = Math.min(run[1] - run[0], bw);
    const jw = waist * 0.5;
    topY = y0 + waist * 0.28; // höftleder en bit under linningen
    left = mid - jw / 2;
    right = mid + jw / 2;
    bottomY = topY + jw * PROP.lower;
  } else {
    // Bröstbredden mellan 40 och 70 % av höjden (under ärmhålen). Har raden tre
    // delar (ärm | kropp | ärm) räknas bara kroppen; annars yttersta pixlarna,
    // så att en urringning inte gör plagget smalare.
    const r0 = type === 'full' ? 0.22 : 0.4, r1 = type === 'full' ? 0.4 : 0.7;
    const widths = [];
    for (let y = Math.round(y0 + bh * r0); y <= Math.round(y0 + bh * r1); y += 2) {
      const runs = [];
      let start = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const on = x <= x1 && mask[y * w + x];
        if (on && start < 0) start = x;
        if (!on && start >= 0) { if (x - start > 2) runs.push([start, x - 1]); start = -1; }
      }
      if (!runs.length) continue;
      if (runs.length >= 3) {
        const body = runs.find(([l, r]) => l <= mid && r >= mid) ?? runs[runs.length >> 1];
        widths.push(body[1] - body[0]);
      } else {
        widths.push(runs[runs.length - 1][1] - runs[0][0]);
      }
    }
    widths.sort((p, q) => p - q);
    const chest = widths.length ? widths[widths.length >> 1] : bw * 0.7;
    const sw = chest * 0.92; // avstånd mellan axellederna
    topY = y0 + Math.min(bh * 0.08, sw * 0.18);
    left = mid - sw / 2;
    right = mid + sw / 2;
    bottomY = topY + sw * PROP[type];
  }
  const nx = (x) => (x - cx0) / cw, ny = (y) => (y - cy0) / chh;
  const anchors = { left: [nx(left), ny(topY)], right: [nx(right), ny(topY)], bottomY: ny(bottomY) };
  // Byxor: hitta benens mittlinjer vid knät och fållen, så att varje ben kan följa
  // personens eget ben (höft → knä → fotled). Kjolar (en enda del) ritas hela.
  let legs = null;
  if (type === 'lower') {
    const centers = (y) => {
      const yy = Math.max(y0, Math.min(y1, Math.round(y)));
      const runs = [];
      let st = -1;
      for (let x = x0; x <= x1 + 1; x++) {
        const on = x <= x1 && mask[yy * w + x];
        if (on && st < 0) st = x;
        if (!on && st >= 0) { if (x - st > bw * 0.06) runs.push((st + x - 1) / 2); st = -1; }
      }
      const L = runs.filter((c2) => c2 < mid), R = runs.filter((c2) => c2 > mid);
      return L.length && R.length ? [L[L.length - 1], R[0]] : null;
    };
    const kneeY = Math.min(bottomY, y1 - bh * 0.05);
    const hemY = y1 - bh * 0.02;
    const k = centers(kneeY), hm = centers(hemY);
    if (k && hm && hemY - kneeY > bh * 0.15) {
      legs = {
        hip: [left - cx0, right - cx0], top: topY - cy0,
        knee: [k[0] - cx0, k[1] - cx0], kneeY: kneeY - cy0,
        hem: [hm[0] - cx0, hm[1] - cx0], hemY: hemY - cy0,
        mid: mid - cx0,
      };
    }
  }
  return remember(img, type, { canvas: out, anchors, legs, ok: true });
}

function remember(img, type, value) {
  const v = cache.get(img) ?? {};
  v[type] = value;
  cache.set(img, v);
  return value;
}
