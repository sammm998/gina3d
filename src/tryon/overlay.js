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
 * Räknar fram var plagget ska ritas.
 * @param {Array} lms        MediaPipe-landmärken (normaliserade)
 * @param {'upper'|'lower'|'full'} type
 * @param {number} W, H      målytans storlek i pixlar
 * @param {boolean} mirror   true för selfie-kamera (bilden visas spegelvänd)
 * @returns {{ cx, cy, width, angle, length } | null}  i normaliserade enheter av W
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
  const angle = Math.atan2(uy, ux);
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const c = pt(spec.bottom[0]);
  const d = pt(spec.bottom[1]);
  let length = width * spec.ratio;
  if (c.v >= VIS && d.v >= VIS) {
    const bx = (c.x + d.x) / 2 - cx, by = (c.y + d.y) / 2 - cy;
    // projicera på normalen (nedåt i plaggets koordinatsystem)
    const proj = bx * -Math.sin(angle) + by * Math.cos(angle);
    if (proj > width * 0.4) length = proj;
  }
  return { cx: cx / W, cy: cy / W, width: width / W, angle, length: length / W };
}

/**
 * Ritar plaggbilden på ctx enligt kroppsramen.
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
  const bodyW = frame.width * W;
  const sx = (bodyW / gw) * scale;
  const sy = ((frame.length * W) / gh) * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(frame.cx * W, frame.cy * W);
  ctx.rotate(frame.angle);
  ctx.translate(offsetX * bodyW, offsetY * bodyW);
  ctx.scale(sx, sy);
  // mjuk skugga ger lite djup mot kroppen
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12 / Math.max(sx, 0.01);
  ctx.shadowOffsetY = 4 / Math.max(sy, 0.01);
  ctx.drawImage(img, -ax, -ay);
  ctx.restore();
}

export function anchorsFor(product, type) {
  return product?.tryOnAnchors ?? DEFAULT_ANCHORS[type];
}
