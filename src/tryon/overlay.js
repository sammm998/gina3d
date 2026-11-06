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

const VIS = 0.45;

/**
 * Räknar fram var plagget ska ritas: tre kroppspunkter (vänster och höger
 * axel/höft samt mitten av nederkanten, t.ex. höfterna eller knäna).
 * Med tre punkter följer plagget både överkroppens lutning och benens riktning
 * (affin avbildning), t.ex. när personen sitter eller lutar sig.
 *
 * @param {Array} lms        MediaPipe-landmärken (normaliserade)
 * @param {'upper'|'lower'|'full'} type
 * @param {number} W, H      målytans storlek i pixlar
 * @param {boolean} mirror   true för selfie-kamera (bilden visas spegelvänd)
 * @returns {{ x1, y1, x2, y2, x3, y3 } | null}  i andelar av W
 */
export function bodyFrame(lms, type, W, H, mirror) {
  if (!lms) return null;
  const spec = BODY[type];
  const pt = (i) => {
    const l = lms[i];
    return { x: (mirror ? 1 - l.x : l.x) * W, y: l.y * H, v: l.visibility ?? 1 };
  };
  let a = pt(spec.top[0]);
  let b = pt(spec.top[1]);
  if (a.v < VIS || b.v < VIS) return null;
  if (a.x > b.x) [a, b] = [b, a];
  const ux = b.x - a.x, uy = b.y - a.y;
  const width = Math.hypot(ux, uy);
  if (width < 8) return null;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  // normalen "nedåt" i plaggets koordinatsystem
  const nx = -uy / width, ny = ux / width;
  let bx = cx + nx * width * spec.ratio, by = cy + ny * width * spec.ratio;
  const c = pt(spec.bottom[0]);
  const d = pt(spec.bottom[1]);
  if (c.v >= VIS && d.v >= VIS) {
    const mx = (c.x + d.x) / 2, my = (c.y + d.y) / 2;
    const vx = mx - cx, vy = my - cy;
    const len = Math.hypot(vx, vy);
    const along = (vx * nx + vy * ny) / (len || 1); // cos(vinkel mot normalen)
    // godta riktningen om den är rimlig (högst ca 55° snett och inte för kort)
    if (len > width * 0.4 && along > 0.57) {
      bx = mx;
      by = my;
    } else if (len > width * 0.4 && along > 0) {
      // för snett: behåll längden men begränsa vinkeln
      const ang = Math.acos(0.57) * Math.sign(vx * ny - vy * nx || 1);
      const ca = Math.cos(-ang), sa = Math.sin(-ang);
      bx = cx + (nx * ca - ny * sa) * len;
      by = cy + (nx * sa + ny * ca) * len;
    }
  }
  // Rimlighetskontroll av bredden: sedd från sidan (t.ex. sittande) blir
  // höft- eller axellinjen orimligt kort. Ersätt då med en bredd från resten av
  // kroppen, vinkelrätt mot riktningen nedåt.
  const down = Math.hypot(bx - cx, by - cy) || 1;
  let minW = 0;
  if (type === 'lower') {
    const s1 = pt(LM.leftShoulder), s2 = pt(LM.rightShoulder);
    if (s1.v >= VIS && s2.v >= VIS) minW = Math.hypot(s2.x - s1.x, s2.y - s1.y) * 0.5;
    minW = Math.max(minW, down * 0.32);
  } else {
    minW = down * (type === 'full' ? 0.22 : 0.45);
  }
  if (width < minW) {
    const dx = (bx - cx) / down, dy = (by - cy) / down; // nedåt
    const px = dy, py = -dx; // vinkelrätt (åt höger i bilden när personen står)
    const sgn = px * (b.x - a.x) + py * (b.y - a.y) >= 0 ? 1 : -1;
    a = { x: cx - px * sgn * minW / 2, y: cy - py * sgn * minW / 2 };
    b = { x: cx + px * sgn * minW / 2, y: cy + py * sgn * minW / 2 };
  }
  return { x1: a.x / W, y1: a.y / W, x2: b.x / W, y2: b.y / W, x3: bx / W, y3: by / W };
}

/**
 * Ritar plaggbilden på ctx enligt kroppsramen (affin avbildning från bildens
 * ankarpunkter till kroppens tre punkter).
 * adjust: { scale = 1, offsetX = 0, offsetY = 0 } – offset i andelar av kroppsbredden.
 */
export function drawGarment(ctx, img, frame, anchors, W, adjust = {}, alpha = 1) {
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
  ctx.save();
  ctx.globalAlpha = alpha;
  // mjuk skugga (skuggparametrar påverkas inte av transformen)
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.setTransform(a, b, c, d, ox - (a * ax + c * ay), oy - (b * ax + d * ay));
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function anchorsFor(product, type) {
  return product?.tryOnAnchors ?? DEFAULT_ANCHORS[type];
}
