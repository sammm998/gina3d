/**
 * Personens kontur (segmenteringsmask från MediaPipe) används för att
 *  - klippa plaggen efter kroppen, så att inget tyg hamnar på bakgrunden
 *  - anpassa plaggets bredd efter kroppens verkliga bredd över bröstet
 */

let cached = { id: null, canvas: null };

/** Masken som canvas (alfa = person), något utvidgad så att plaggets kanter får plats. */
export function maskCanvas(mask) {
  if (!mask) return null;
  if (cached.id === mask.id) return cached.canvas;
  const { data, w, h } = mask;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const img = src.getContext('2d').createImageData(w, h);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = data[i] > 0.5 ? 255 : data[i] > 0.3 ? (data[i] - 0.3) * 1275 : 0;
  src.getContext('2d').putImageData(img, 0, 0);
  // utvidga ~1 % av bredden och mjuka upp kanten en aning
  const out = cached.canvas ?? document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  g.clearRect(0, 0, w, h);
  const d = Math.max(1, Math.round(w * 0.01));
  g.filter = `blur(${Math.max(0.8, w / 900)}px)`;
  for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) g.drawImage(src, dx, dy);
  g.filter = 'none';
  cached = { id: mask.id, canvas: out };
  return out;
}

const at = (mask, x, y) => {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= mask.w || yi >= mask.h) return -1;
  return mask.data[yi * mask.w + xi];
};

/**
 * Justerar en kroppsram (överdel/klänning) efter konturen: bredden över bröstet
 * och mitten. frame i andelar av W (se bodyFrame). mirror: om bilden visas spegelvänd.
 */
export function fitFrameToBody(frame, mask, W, H, mirror, type = 'upper') {
  if (!frame || !mask) return frame;
  const sx = mask.w / W, sy = mask.h / H;
  const P1 = [frame.x1 * W, frame.y1 * W], P2 = [frame.x2 * W, frame.y2 * W], P3 = [frame.x3 * W, frame.y3 * W];
  const C = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
  const sw = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
  if (sw < 10) return frame;
  const u = [(P2[0] - P1[0]) / sw, (P2[1] - P1[1]) / sw];
  const nl = Math.hypot(P3[0] - C[0], P3[1] - C[1]) || 1;
  const n = [(P3[0] - C[0]) / nl, (P3[1] - C[1]) / nl];
  // överdel: mät på bröstets höjd (en bit under axellinjen); underdel: vid höftlederna
  const down = type === 'lower' ? 0.15 : 0.42;
  const Q = [C[0] + n[0] * sw * down, C[1] + n[1] * sw * down];
  const toMask = (x, y) => [(mirror ? W - x : x) * sx, y * sy];
  const [qx, qy] = toMask(...Q);
  if (at(mask, qx, qy) < 0.5) return frame; // ingen person i mitten – lita på landmärkena
  const step = 1 / Math.max(sx, 0.001);
  const walk = (dir) => {
    let t = 0;
    while (t < sw * 1.2) {
      t += step;
      const [mx, my] = toMask(Q[0] + u[0] * t * dir, Q[1] + u[1] * t * dir);
      const v = at(mask, mx, my);
      if (v < 0) return null; // utanför bilden – osäkert
      if (v < 0.5) return t;
    }
    return null;
  };
  const l = walk(-1), r = walk(1);
  if (l == null || r == null) return frame;
  const width = l + r;
  if (width < sw * (type === 'lower' ? 1.2 : 0.7)) return frame;
  // plaggets bröstbredd ≈ axelledsavståndet / 0,92; midjan ≈ 2 × höftledsavståndet (se garmentPrep.js)
  const garmentW = type === 'lower' ? sw * 2 : sw / 0.92;
  const k = Math.max(0.8, Math.min(1.25, (width * 1.03) / garmentW));
  const shift = Math.max(-sw * 0.12, Math.min(sw * 0.12, (r - l) / 2));
  const Cn = [C[0] + u[0] * shift, C[1] + u[1] * shift];
  const half = (sw * k) / 2;
  return {
    ...frame,
    x1: (Cn[0] - u[0] * half) / W, y1: (Cn[1] - u[1] * half) / W,
    x2: (Cn[0] + u[0] * half) / W, y2: (Cn[1] + u[1] * half) / W,
    x3: (P3[0] + u[0] * shift) / W, y3: (P3[1] + u[1] * shift) / W,
  };
}
