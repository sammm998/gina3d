/**
 * 2D-överlagring av plagg (tryOnImage) på en person.
 *
 * OBS: Detta är en förenklad 2D-överlagring – plaggbilden skalas, roteras och
 * flyttas efter några kroppspunkter. Det är INTE en fysisk tygsimulering:
 * veck, fall, ärmar, armar framför kroppen och passform beräknas inte.
 * För realistiska resultat kan en extern virtual try-on-tjänst kopplas in
 * via src/tryon/providers/.
 */
import { LM } from './poseTracker.js';

/**
 * Standardankare i tryOn-bilden (normaliserade 0–1). Kan överstyras per
 * produkt med `tryOnAnchors` i products.json.
 *   upper: left/right = axlar, bottomY = höftlinjen
 *   lower: left/right = höftleder, bottomY = knälinjen
 *   full:  left/right = axlar, bottomY = knälinjen
 */
export const DEFAULT_ANCHORS = {
  upper: { left: [0.3, 0.13], right: [0.7, 0.13], bottomY: 0.8 },
  lower: { left: [0.33, 0.14], right: [0.67, 0.14], bottomY: 0.56 },
  full: { left: [0.36, 0.06], right: [0.64, 0.06], bottomY: 0.86 },
};

/** Vilka kroppspunkter som styr respektive plaggtyp. */
const BODY = {
  upper: { top: [LM.leftShoulder, LM.rightShoulder], bottom: [LM.leftHip, LM.rightHip], ratio: 1.35 },
  lower: { top: [LM.leftHip, LM.rightHip], bottom: [LM.leftKnee, LM.rightKnee], ratio: 2.3 },
  full: { top: [LM.leftShoulder, LM.rightShoulder], bottom: [LM.leftKnee, LM.rightKnee], ratio: 2.9 },
};

const VIS = 0.6;
const MAX_LEAN = (18 * Math.PI) / 180;

/**
 * Räknar fram var plagget ska ritas: tre kroppspunkter (vänster och höger
 * axel/höftled samt mitten av nederkanten).
 *
 * Bredd och lutning tas från axlarna (resp. höftlederna). Längden följer
 * kroppens proportioner – plagget sträcks alltså aldrig ut, även om höfter
 * eller knän ligger utanför bilden (t.ex. när man sitter nära kameran).
 * Syns de nedre punkterna tydligt får plagget luta med kroppen (högst 18°).
 *
 * @param {Array} lms        MediaPipe-landmärken (normaliserade)
 * @param {'upper'|'lower'|'full'} type
 * @param {number} W, H      målytans storlek i pixlar
 * @param {boolean} mirror   true för selfie-kamera (bilden visas spegelvänd)
 * @returns {{ x1, y1, x2, y2, x3, y3, near?: boolean } | null}  i andelar av W
 */
export function bodyFrame(lms, type, W, H, mirror) {
  if (!lms) return null;
  const spec = BODY[type];
  const pt = (i) => {
    const l = lms[i];
    return { x: (mirror ? 1 - l.x : l.x) * W, y: l.y * H, v: l.visibility ?? 1, inside: l.x > -0.02 && l.x < 1.02 && l.y > -0.02 && l.y < 1.02 };
  };
  let a = pt(spec.top[0]);
  let b = pt(spec.top[1]);
  if (a.v < VIS || b.v < VIS || !a.inside || !b.inside) return null;
  if (a.x > b.x) [a, b] = [b, a];
  const ux = b.x - a.x, uy = b.y - a.y;
  let width = Math.hypot(ux, uy);
  if (width < 8) return null;
  // linjen får inte luta orimligt (fel identifierade punkter)
  if (Math.abs(Math.atan2(uy, ux)) > (40 * Math.PI) / 180) return null;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  // Höftledernas avstånd underskattas när man står snett – använd axlarna som stöd.
  if (type === 'lower') {
    const s1 = pt(LM.leftShoulder), s2 = pt(LM.rightShoulder);
    if (s1.v >= VIS && s2.v >= VIS) width = Math.max(width, Math.hypot(s2.x - s1.x, s2.y - s1.y) * 0.5);
  }
  // nedåt = vinkelrätt mot axel-/höftlinjen
  let nx = -uy / Math.hypot(ux, uy), ny = ux / Math.hypot(ux, uy);
  const c = pt(spec.bottom[0]);
  const d = pt(spec.bottom[1]);
  let len = width * spec.ratio;
  if (c.v >= 0.75 && d.v >= 0.75 && c.inside && d.inside) {
    const vx = (c.x + d.x) / 2 - cx, vy = (c.y + d.y) / 2 - cy;
    const real = Math.hypot(vx, vy);
    // tydligt synliga höfter/knän: använd verklig längd om den är rimlig
    if (real > len * 0.75 && real < len * 1.45) len = real;
    if (real > width * spec.ratio * 0.6) {
      // luta med kroppen, men högst MAX_LEAN
      let ang = Math.atan2(vx * ny - vy * nx, vx * nx + vy * ny);
      ang = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, ang)) * 0.8;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      [nx, ny] = [nx * ca - ny * sa, nx * sa + ny * ca];
    }
  }
  // behåll vinkelrät bredd i linjens riktning (ingen skjuvning)
  const hx = (ux / Math.hypot(ux, uy)) * (width / 2), hy = (uy / Math.hypot(ux, uy)) * (width / 2);
  a = { x: cx - hx, y: cy - hy };
  b = { x: cx + hx, y: cy + hy };
  const bx = cx + nx * len, by = cy + ny * len;
  return { x1: a.x / W, y1: a.y / W, x2: b.x / W, y2: b.y / W, x3: bx / W, y3: by / W, near: width > W * 0.42 };
}

/**
 * Ritar plaggbilden på ctx enligt kroppsramen (affin avbildning från bildens
 * ankarpunkter till kroppens tre punkter).
 * adjust: { scale = 1, offsetX = 0, offsetY = 0 } – offset i andelar av kroppsbredden.
 */
export function drawGarment(ctx, img, frame, anchors, W, adjust = {}, alpha = 1, clip = null) {
  if (!frame || !img) return;
  const { scale = 1, offsetX = 0, offsetY = 0 } = adjust;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const ax = ((anchors.left[0] + anchors.right[0]) / 2) * iw;
  const ay = ((anchors.left[1] + anchors.right[1]) / 2) * ih;
  const gw = Math.max(1, (anchors.right[0] - anchors.left[0]) * iw);
  const gh = Math.max(1, (anchors.bottomY - (anchors.left[1] + anchors.right[1]) / 2) * ih);
  const P1 = [frame.x1 * W, frame.y1 * W], P2 = [frame.x2 * W, frame.y2 * W], P3 = [frame.x3 * W, frame.y3 * W];
  const mid = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
  // kolumnvektorer: bildens x-axel -> axel/höftlinjen, bildens y-axel -> mot nederkanten
  let v1 = [(P2[0] - P1[0]) * scale, (P2[1] - P1[1]) * scale];
  let v2 = [(P3[0] - mid[0]) * scale, (P3[1] - mid[1]) * scale];
  const bodyW = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
  const u1 = [v1[0] / (Math.hypot(...v1) || 1), v1[1] / (Math.hypot(...v1) || 1)];
  const u2 = [v2[0] / (Math.hypot(...v2) || 1), v2[1] / (Math.hypot(...v2) || 1)];
  const ox = mid[0] + (u1[0] * offsetX + u2[0] * offsetY) * bodyW;
  const oy = mid[1] + (u1[1] * offsetX + u2[1] * offsetY) * bodyW;
  const a = v1[0] / gw, b = v1[1] / gw, c = v2[0] / gh, d = v2[1] / gh;
  const W2 = ctx.canvas.width, H2 = ctx.canvas.height;
  const T = [a, b, c, d, ox - (a * ax + c * ay), oy - (b * ax + d * ay)];
  // Ritas först på ett eget lager: plagget + skuggning som följer kroppens rundning
  layer ??= document.createElement('canvas');
  if (layer.width !== W2 || layer.height !== H2) { layer.width = W2; layer.height = H2; }
  const g = layer.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W2, H2);
  g.setTransform(...T);
  g.drawImage(img, 0, 0);
  // mörkare mot sidorna (kroppen rundar av), lite mörkare nedtill
  g.globalCompositeOperation = 'source-atop';
  const half = gw * 0.9;
  const sx = g.createLinearGradient(ax - half, 0, ax + half, 0);
  sx.addColorStop(0, 'rgba(0,0,0,0.30)');
  sx.addColorStop(0.22, 'rgba(0,0,0,0.06)');
  sx.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  sx.addColorStop(0.78, 'rgba(0,0,0,0.06)');
  sx.addColorStop(1, 'rgba(0,0,0,0.30)');
  g.fillStyle = sx;
  g.fillRect(0, 0, iw, ih);
  const sy = g.createLinearGradient(0, ay, 0, ay + gh * 1.2);
  sy.addColorStop(0, 'rgba(0,0,0,0.10)');
  sy.addColorStop(0.15, 'rgba(0,0,0,0)');
  sy.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = sy;
  g.fillRect(0, 0, iw, ih);
  // klipp efter personens kontur – inget tyg utanför kroppen
  if (clip?.canvas) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    if (clip.mirror) { g.translate(W2, 0); g.scale(-1, 1); }
    g.drawImage(clip.canvas, 0, 0, W2, H2);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  // mjuk kontaktskugga mot kroppen
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = Math.max(6, bodyW * 0.04);
  ctx.shadowOffsetY = Math.max(2, bodyW * 0.012);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

let layer = null;

export function anchorsFor(product, type) {
  return product?.tryOnAnchors ?? DEFAULT_ANCHORS[type];
}

/**
 * Ritar ett förberett plagg (se garmentPrep.js) – bild och ankare kommer från
 * plaggets egen form i stället för produktdatat.
 */
export function drawPrepared(ctx, prep, frame, W, adjust, alpha, clip = null) {
  if (!prep?.ok) return;
  drawGarment(ctx, prep.canvas, frame, prep.anchors, W, adjust, alpha, clip);
}

let armMask = null;

/**
 * Ritar personens underarmar och händer (och överarmar som korsar kroppen)
 * ovanpå plaggen igen – armar framför kroppen hamnar då framför tyget, som i
 * verkligheten. raw = den ursprungliga bilden/videobilden utan plagg.
 */
export function drawArmsOver(ctx, raw, lms, W, H, mirror) {
  if (!raw || !lms) return;
  const pt = (i) => {
    const l = lms[i];
    return l ? { x: (mirror ? 1 - l.x : l.x) * W, y: l.y * H, v: l.visibility ?? 1 } : null;
  };
  const s1 = pt(LM.leftShoulder), s2 = pt(LM.rightShoulder);
  if (!s1 || !s2 || s1.v < VIS || s2.v < VIS) return;
  const sw = Math.hypot(s2.x - s1.x, s2.y - s1.y);
  if (sw < 10) return;
  const minX = Math.min(s1.x, s2.x), maxX = Math.max(s1.x, s2.x);
  armMask ??= document.createElement('canvas');
  if (armMask.width !== W || armMask.height !== H) { armMask.width = W; armMask.height = H; }
  const g = armMask.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  g.filter = `blur(${Math.max(1, sw * 0.012)}px)`;
  g.strokeStyle = g.fillStyle = '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let any = false;
  for (const [sh, el, wr, ix] of [[s1, LM.leftElbow, LM.leftWrist, LM.leftIndex], [s2, LM.rightElbow, LM.rightWrist, LM.rightIndex]]) {
    const e = pt(el), w = pt(wr), h = pt(ix);
    if (!e || !w || e.v < 0.5 || w.v < 0.5) continue;
    any = true;
    g.lineWidth = sw * 0.24;
    g.beginPath();
    // överarmen bara när armbågen är inne framför kroppen (armen korsar bålen)
    if (e.x > minX + sw * 0.12 && e.x < maxX - sw * 0.12) {
      g.moveTo(sh.x + (e.x - sh.x) * 0.25, sh.y + (e.y - sh.y) * 0.25);
      g.lineTo(e.x, e.y);
    } else {
      g.moveTo(e.x, e.y);
    }
    g.lineTo(w.x, w.y);
    if (h && h.v > 0.3) g.lineTo(w.x + (h.x - w.x) * 0.9, w.y + (h.y - w.y) * 0.9);
    g.stroke();
    // handen
    g.beginPath();
    const hx = h && h.v > 0.3 ? (w.x + h.x) / 2 : w.x, hy = h && h.v > 0.3 ? (w.y + h.y) / 2 : w.y;
    g.arc(hx, hy, sw * 0.17, 0, Math.PI * 2);
    g.fill();
  }
  if (!any) return;
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.drawImage(raw, 0, 0, W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(armMask, 0, 0);
  ctx.restore();
}

/** Affin transform som avbildar segmentet g0→g1 (plaggbild) på b0→b1 (kropp), med bredden skalad k. */
function segTransform(g0, g1, b0, b1, k) {
  const gx = g1[0] - g0[0], gy = g1[1] - g0[1];
  const gl = Math.hypot(gx, gy) || 1;
  const bx = b1[0] - b0[0], by = b1[1] - b0[1];
  const bl = Math.hypot(bx, by) || 1;
  // plaggets lokala bas (längs benet, tvärs benet) → kroppens bas
  const ug = [gx / gl, gy / gl], pg = [-ug[1], ug[0]];
  const ub = [bx / bl, by / bl], pb = [-ub[1], ub[0]];
  const s = bl / gl;
  // M = [ub*s, pb*k] * [ug, pg]^T
  const a = ub[0] * s * ug[0] + pb[0] * k * pg[0];
  const c = ub[0] * s * ug[1] + pb[0] * k * pg[1];
  const b = ub[1] * s * ug[0] + pb[1] * k * pg[0];
  const d = ub[1] * s * ug[1] + pb[1] * k * pg[1];
  return [a, b, c, d, b0[0] - (a * g0[0] + c * g0[1]), b0[1] - (b * g0[0] + d * g0[1])];
}

/**
 * Byxor ben för ben: varje ben delas vid knät och följer personens
 * höft → knä → fotled. Returnerar false om benen inte syns (då ritas plagget helt).
 */
export function drawTrousers(ctx, prep, frame, lms, W, H, mirror, adjust = {}, alpha = 1, clip = null) {
  const L = prep?.legs;
  if (!L || !lms) return false;
  const pt = (i) => {
    const l = lms[i];
    return { x: (mirror ? 1 - l.x : l.x) * W, y: l.y * H, v: l.visibility ?? 1 };
  };
  const sides = [[LM.leftHip, LM.leftKnee, LM.leftAnkle], [LM.rightHip, LM.rightKnee, LM.rightAnkle]].map((ids) => ids.map(pt));
  if (sides.some(([h, k]) => h.v < VIS || k.v < VIS)) return false;
  sides.sort((p, q) => p[0].x - q[0].x); // vänster i bilden först
  const { scale = 1, offsetX = 0, offsetY = 0 } = adjust;
  // höftlederna i ramen (redan breddanpassade efter kroppen)
  const hipL = [frame.x1 * W, frame.y1 * W], hipR = [frame.x2 * W, frame.y2 * W];
  const gHipW = Math.abs(L.hip[1] - L.hip[0]) || 1;
  const k = (Math.hypot(hipR[0] - hipL[0], hipR[1] - hipL[1]) / gHipW) * scale;
  const bw = Math.hypot(hipR[0] - hipL[0], hipR[1] - hipL[1]);
  const off = [offsetX * bw, offsetY * bw];
  const W2 = ctx.canvas.width, H2 = ctx.canvas.height;
  layer ??= document.createElement('canvas');
  if (layer.width !== W2 || layer.height !== H2) { layer.width = W2; layer.height = H2; }
  const g = layer.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W2, H2);
  const img = prep.canvas;
  const iw = img.width, ih = img.height;
  const hips = [hipL, hipR];
  sides.forEach(([, knee, ankle], i) => {
    const bh = [hips[i][0] + off[0], hips[i][1] + off[1]];
    const bk = [knee.x + off[0], knee.y + off[1]];
    // fotleden: syns den inte, fortsätt rakt i lårets riktning
    const thigh = Math.hypot(bk[0] - bh[0], bk[1] - bh[1]);
    let ba = ankle.v >= 0.5 ? [ankle.x + off[0], ankle.y + off[1]] : [bk[0] + (bk[0] - bh[0]), bk[1] + (bk[1] - bh[1])];
    // garnera mot orimliga fotleder (felidentifierade)
    const shin = Math.hypot(ba[0] - bk[0], ba[1] - bk[1]);
    if (shin < thigh * 0.6 || shin > thigh * 1.6) ba = [bk[0] + (bk[0] - bh[0]), bk[1] + (bk[1] - bh[1])];
    const gH = [L.hip[i], L.top], gK = [L.knee[i], L.kneeY];
    const gA = [L.hem[i], L.hemY];
    // fållens punkt motsvarar inte fotleden exakt – förläng skenbenet proportionerligt
    const gShin = Math.hypot(gA[0] - gK[0], gA[1] - gK[1]);
    const gThigh = Math.hypot(gK[0] - gH[0], gK[1] - gH[1]) || 1;
    const bThigh = Math.hypot(bk[0] - bh[0], bk[1] - bh[1]) || 1;
    const bShinLen = Math.hypot(ba[0] - bk[0], ba[1] - bk[1]) || 1;
    const want = (gShin / gThigh) * bThigh; // samma proportion som i plagget
    // fotlånga byxor: fållen vid fotleden; kortare (shorts, capri): samma proportion som plagget
    let sh = want / bShinLen;
    sh = sh > 0.8 ? 1.03 : Math.max(0.1, sh);
    const bA = [bk[0] + (ba[0] - bk[0]) * sh, bk[1] + (ba[1] - bk[1]) * sh];
    const x0 = i === 0 ? 0 : L.mid, x1 = i === 0 ? L.mid : iw;
    // lår: från linningen (ovanför höftleden) till strax under knät
    g.save();
    g.setTransform(...segTransform(gH, gK, bh, bk, k));
    g.beginPath();
    g.rect(x0, 0, x1 - x0, gK[1] + 2);
    g.clip();
    g.drawImage(img, 0, 0);
    g.restore();
    // skenben
    g.save();
    g.setTransform(...segTransform(gK, gA, bk, bA, k));
    g.beginPath();
    g.rect(x0, gK[1] - 1, x1 - x0, ih - gK[1] + 1);
    g.clip();
    g.drawImage(img, 0, 0);
    g.restore();
  });
  if (clip?.canvas) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    if (clip.mirror) { g.translate(W2, 0); g.scale(-1, 1); }
    g.drawImage(clip.canvas, 0, 0, W2, H2);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = Math.max(6, bw * 0.06);
  ctx.shadowOffsetY = Math.max(2, bw * 0.02);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  return true;
}
