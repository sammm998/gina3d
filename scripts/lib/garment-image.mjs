/**
 * Bildanalys för importerade produktbilder (körs i Node med sharp):
 *  - classify(): skiljer produktbild (plagget ensamt, jämn bakgrund) från modellfoto
 *  - cutout():   frilägger plagget från en jämn bakgrund till transparent PNG
 *  - anchors():  uppskattar axlar/höfter/nederkant för AR-provningen ur masken
 */
import sharp from 'sharp';

const isSkin = (r, g, b) => r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && !(r > 220 && g > 200 && b > 180);

/** Returnerar { skin, borderStd, score } – lägre score = troligare ren produktbild. */
export async function classify(file) {
  const W = 48, H = 64;
  const { data } = await sharp(file).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // plaggets färg = median i bildens mitt; hudlika pixlar i den färgen räknas inte (beige plagg)
  const center = [];
  for (let y = Math.round(H * 0.35); y < H * 0.65; y++) for (let x = Math.round(W * 0.35); x < W * 0.65; x++) center.push((y * W + x) * 3);
  const cm = [0, 1, 2].map((c) => center.map((i) => data[i + c]).sort((a, b) => a - b)[center.length >> 1]);
  let skin = 0;
  const border = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (isSkin(r, g, b) && Math.hypot(r - cm[0], g - cm[1], b - cm[2]) > 38) skin++;
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) border.push((r + g + b) / 3);
    }
  }
  const mean = border.reduce((a, v) => a + v, 0) / border.length;
  const std = Math.sqrt(border.reduce((a, v) => a + (v - mean) ** 2, 0) / border.length);
  const s = skin / (W * H);
  return { skin: s, borderStd: std, borderMean: mean, score: s * 4 + std / 60 + (mean < 150 ? 0.5 : 0) };
}

/**
 * Frilägger plagget: flood fill från kanterna över pixlar som liknar bakgrunden,
 * mjuk kant, beskärning till plaggets yta. Fungerar bäst på produktbilder mot
 * jämn ljus bakgrund (packshots).
 */
export async function cutout(file, outFile, { width = 800, tolerance = 26 } = {}) {
  const img = sharp(file).resize({ width, withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  // bakgrundsfärg = median av kantpixlar
  const edge = [];
  for (let x = 0; x < W; x++) edge.push(px(x), px((H - 1) * W + x));
  for (let y = 0; y < H; y++) edge.push(px(y * W), px(y * W + W - 1));
  const med = [0, 1, 2].map((c) => edge.map((p) => p[c]).sort((a, b) => a - b)[edge.length >> 1]);
  const dist = (i) => {
    const [r, g, b] = px(i);
    return Math.hypot(r - med[0], g - med[1], b - med[2]);
  };
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = (i) => {
    if (!bg[i] && dist(i) < tolerance) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }
  // alfa + mjuk kant (pixlar som gränsar mot bakgrunden blir halvtransparenta efter likhet)
  let minX = W, minY = H, maxX = 0, maxY = 0, fg = 0;
  for (let i = 0; i < W * H; i++) {
    if (bg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const x = i % W, y = (i / W) | 0;
    const nearBg = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (y > 0 && bg[i - W]) || (y < H - 1 && bg[i + W]);
    if (nearBg) data[i * 4 + 3] = Math.max(60, Math.min(255, ((dist(i) - tolerance) / tolerance) * 255 + 120));
    fg++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const coverage = fg / (W * H);
  if (coverage < 0.04 || coverage > 0.92) throw new Error(`friläggningen såg fel ut (täckning ${(coverage * 100).toFixed(0)} %)`);
  // Hud inne i motivet (ansikte, armar, ben) avslöjar en modell. Plaggets egen
  // färg räknas inte (beige/brunt tyg kan likna hud).
  const fgCols = [];
  for (let i = 0; i < W * H; i += 13) if (!bg[i]) fgCols.push(px(i));
  const gm = [0, 1, 2].map((c) => fgCols.map((p) => p[c]).sort((a, b) => a - b)[fgCols.length >> 1] ?? 0);
  let skinFg = 0, samples = 0;
  for (let i = 0; i < W * H; i += 7) {
    if (bg[i]) continue;
    samples++;
    const [r, g, b] = px(i);
    if (Math.hypot(r - gm[0], g - gm[1], b - gm[2]) < 48) continue;
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && !(r > 220 && g > 200 && b > 180)) skinFg++;
  }
  const skinShare = samples ? skinFg / samples : 0;
  if (skinShare > 0.12) throw new Error(`för mycket hudton i motivet (${(skinShare * 100).toFixed(0)} %)`);
  // Modellfoton är beskurna (personen går ut i kanten) OCH visar hud. Produktbilder
  // kan också vara tätt beskurna, men har ingen hud – de godkänns.
  const margin = 0.012;
  const touches = minY < H * margin || maxY > H * (1 - margin) || minX < W * 0.004 || maxX > W * (1 - 0.004);
  if (touches && skinShare > 0.015) throw new Error('motivet når bildkanten och visar hud – troligen ett modellfoto');
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.015);
  const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
  const cw = Math.min(W - left, maxX - minX + 1 + pad * 2), ch = Math.min(H - top, maxY - minY + 1 + pad * 2);

  // städa kanten: ta bort enstaka lösa pixlar och mjuka upp konturen något
  const A = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) A[i] = data[i * 4 + 3];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let n = 0;
      for (const d of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) if (A[i + d] > 128) n++;
      if (A[i] > 128 && n <= 2) data[i * 4 + 3] = 0; // ensam pixel
      else if (A[i] <= 128 && n >= 7) data[i * 4 + 3] = 255; // litet hål
      else if (n > 0 && n < 8) data[i * 4 + 3] = Math.round((data[i * 4 + 3] * 2 + (n / 8) * 255) / 3);
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width: cw, height: ch }).png({ compressionLevel: 9 }).toFile(outFile);
  return { coverage, width: cw, height: ch };
}

/**
 * Uppskattar ankare för AR-provningen ur den frilagda bildens alfakanal.
 * type: 'upper' | 'lower' | 'full'; cls: plaggklass (t.ex. 'outer', 'skirt').
 */
export async function anchors(pngFile, type, cls) {
  const { data, info } = await sharp(pngFile).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rowExtent = (yN) => {
    const y = Math.min(H - 1, Math.max(0, Math.round(yN * H)));
    let l = -1, r = -1;
    for (let x = 0; x < W; x++) if (data[y * W + x] > 128) { if (l < 0) l = x; r = x; }
    return l < 0 ? [0.2, 0.8] : [l / W, r / W];
  };
  const round = (v) => Math.round(v * 1000) / 1000;
  if (type === 'lower') {
    const y = 0.06;
    const [l, r] = rowExtent(y);
    const inset = (r - l) * 0.18;
    return { left: [round(l + inset), y + 0.04], right: [round(r - inset), y + 0.04], bottomY: cls === 'skirt' ? 0.8 : 0.52 };
  }
  const y = type === 'full' ? 0.07 : 0.1;
  // axlarna: torsons bredd en bit ner (ärmar som hänger ut räknas inte)
  const [l, r] = rowExtent(type === 'full' ? 0.2 : 0.22);
  const inset = (r - l) * (type === 'full' ? 0.12 : 0.08);
  return {
    left: [round(l + inset), y],
    right: [round(r - inset), y],
    bottomY: type === 'full' ? 0.78 : cls === 'outer' ? 0.6 : 0.86,
  };
}
