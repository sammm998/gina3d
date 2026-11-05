/**
 * Butiksinredningen. Varje möbel beskrivs som data:
 *
 *   { id, type, zone, x, z, rot, ...typspecifika mått }
 *
 * - type:      vilken 3D-komponent som ritar möbeln (se src/scene/fixtures/index.jsx)
 * - zone:      zon-id från zones.js – avgör vilka produkter som placeras här
 * - x, z:      position i meter (golvplanet), rot: rotation runt y-axeln i radianer
 * - colliders: beräknas automatiskt – rektanglar/cirklar som besökaren inte kan gå igenom
 * - slots:     produktplatser (beräknas automatiskt) som fylls med produkter i steg 3
 * - map:       figur som ritas på minikartan
 *
 * Rotation: 0 = möbelns framsida mot +z (mot entrén), PI/2 = mot +x, -PI/2 = mot −x, PI = mot −z.
 */
import { FLOOR_H, STORE } from './storeConfig.js';

const R0 = 0;
const FACE_X = Math.PI / 2;     // framsida mot +x (står mot vänster vägg)
const FACE_NX = -Math.PI / 2;   // framsida mot −x (står mot höger vägg)
const FACE_NZ = Math.PI;        // framsida mot −z (mot bakvägg/inåt)

/** Roterar en lokal punkt (lx, lz) och lägger till möbelns position. */
export function toWorld(f, lx, lz) {
  const c = Math.cos(f.rot || 0), s = Math.sin(f.rot || 0);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

/** Axelparallell rektangel för en möbel med bredd w (lokal x) och djup d (lokal z), centrerad i (cx, cz) lokalt. */
function rectFor(f, w, d, cx = 0, cz = 0) {
  const [x, z] = toWorld(f, cx, cz);
  const quarter = Math.round(((f.rot || 0) / (Math.PI / 2)) % 2);
  const swap = Math.abs(quarter) === 1;
  const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
  return [x - hw, z - hd, x + hw, z + hd];
}

// ---------------------------------------------------------------- byggfunktioner

function podium(id, zone, x, z, opts = {}) {
  const f = { id, type: 'podium', zone, x, z, rot: 0, r1: 0.9, r2: 0.52, h1: 0.42, h2: 0.86, ...opts };
  f.colliders = [{ circle: [x, z, f.r1 + 0.02] }];
  f.map = { circle: [x, z, f.r1] };
  f.slots = [];
  // vikta plagg på den övre nivån
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    f.slots.push({ kind: 'fold', pos: [x + Math.cos(a) * 0.26, f.h2, z + Math.sin(a) * 0.26], rot: -a + Math.PI / 2 });
  }
  // skor och väskor på den lägre nivån
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = (f.r1 + f.r2) / 2 + 0.02;
    f.slots.push({ kind: 'accessory', pos: [x + Math.cos(a) * r, f.h1, z + Math.sin(a) * r], rot: Math.atan2(Math.cos(a), Math.sin(a)) });
  }
  return f;
}

function table(id, zone, x, z, rot = 0, opts = {}) {
  const f = { id, type: 'table', zone, x, z, rot, w: 1.7, d: 0.85, h1: 0.45, h2: 0.88, ...opts };
  f.colliders = [{ rect: rectFor(f, f.w + 0.05, f.d + 0.05) }];
  f.map = { rect: rectFor(f, f.w, f.d) };
  f.slots = [];
  // övre nivå: smalare bord i mitten
  const topW = f.w * 0.62;
  for (let i = 0; i < 3; i++) {
    const lx = -topW / 2 + topW * ((i + 0.5) / 3);
    const [wx, wz] = toWorld(f, lx, 0);
    f.slots.push({ kind: 'fold', pos: [wx, f.h2, wz], rot });
  }
  // nedre nivå: ändarna
  for (const lx of [-f.w / 2 + 0.16, f.w / 2 - 0.16]) {
    for (const lz of [-0.18, 0.18]) {
      const [wx, wz] = toWorld(f, lx, lz);
      f.slots.push({ kind: 'accessory', pos: [wx, f.h1, wz], rot: rot + (lx < 0 ? Math.PI / 2 : -Math.PI / 2) });
    }
  }
  return f;
}

/**
 * Väggsektion med svart klädstång: face-out-armar i ändarna och sidohängda plagg i mitten.
 * x/z anger mitten av sektionen längs väggen; rot pekar ut från väggen.
 */
function wallBay(id, zone, x, z, rot, opts = {}) {
  const f = { id, type: 'wallBay', zone, x, z, rot, length: 2.6, depth: 0.55, railY: 1.72, ...opts };
  f.colliders = [{ rect: rectFor(f, f.length, f.depth + 0.1, 0, f.depth / 2) }];
  f.map = { rect: rectFor(f, f.length, f.depth, 0, f.depth / 2) };
  const faceW = 0.7;
  const sideLen = f.length - faceW * 2;
  f.slots = [];
  for (const lx of [-f.length / 2 + faceW / 2, f.length / 2 - faceW / 2]) {
    const [wx, wz] = toWorld(f, lx, 0.36);
    f.slots.push({ kind: 'faceout', pos: [wx, f.railY - 0.08, wz], rot });
  }
  const [sx, sz] = toWorld(f, 0, 0.3);
  f.slots.push({ kind: 'side', count: Math.round(sideLen / 0.068), length: sideLen, pos: [sx, f.railY, sz], rot });
  // hylla ovanför stången med vikta plagg
  if (f.topShelf !== false) {
    const n = Math.max(2, Math.round(f.length / 0.65));
    for (let i = 0; i < n; i++) {
      const lx = -f.length / 2 + f.length * ((i + 0.5) / n);
      const [wx, wz] = toWorld(f, lx, 0.2);
      f.slots.push({ kind: 'fold', pos: [wx, f.railY + 0.42, wz], rot, maxStack: 3 });
    }
  }
  return f;
}

/** Fristående klädställning med sidohängda plagg och ett face-out-plagg i ena änden. */
function freeRail(id, zone, x, z, rot, opts = {}) {
  const f = { id, type: 'freeRail', zone, x, z, rot, length: 1.6, railY: 1.5, ...opts };
  f.colliders = [{ rect: rectFor(f, f.length + 0.2, 0.62) }];
  f.map = { rect: rectFor(f, f.length + 0.1, 0.5) };
  f.slots = [{ kind: 'side', count: Math.round((f.length - 0.15) / 0.068), length: f.length - 0.15, pos: [x, f.railY, z], rot }];
  return f;
}

/** Öppna hyllor för vikta jeans (denimväggen). */
function shelf(id, zone, x, z, rot, opts = {}) {
  const f = { id, type: 'shelf', zone, x, z, rot, length: 2.4, depth: 0.45, levels: [0.1, 0.48, 0.86, 1.24, 1.62], height: 2.05, ...opts };
  f.colliders = [{ rect: rectFor(f, f.length, f.depth + 0.08, 0, f.depth / 2) }];
  f.map = { rect: rectFor(f, f.length, f.depth, 0, f.depth / 2) };
  f.slots = [];
  const perLevel = 5;
  f.levels.forEach((y) => {
    for (let i = 0; i < perLevel; i++) {
      const lx = -f.length / 2 + f.length * ((i + 0.5) / perLevel);
      const [wx, wz] = toWorld(f, lx, f.depth / 2 + 0.02);
      f.slots.push({ kind: 'fold', pos: [wx, y + 0.025, wz], rot, maxStack: 5 });
    }
  });
  return f;
}

function platform(id, zone, x, z, opts = {}) {
  const f = { id, type: 'platform', zone, x, z, rot: 0, w: 6, d: 0.95, h: 0.12, ...opts };
  f.colliders = [{ rect: rectFor(f, f.w, f.d) }];
  f.map = { rect: rectFor(f, f.w, f.d) };
  f.slots = [];
  return f;
}

function mannequin(id, zone, x, z, rot, look, y = 0) {
  return {
    id, type: 'mannequin', zone, x, z, rot, y, look,
    colliders: y === 0 ? [{ circle: [x, z, 0.32] }] : [],
    slots: [{ kind: 'mannequin', look, pos: [x, y, z], rot }],
  };
}

function screen(id, zone, x, z, rot, opts = {}) {
  const f = { id, type: 'screen', zone, x, z, rot, images: [0, 1, 2, 3], ...opts };
  f.colliders = [{ rect: rectFor(f, 0.75, 0.45) }];
  f.map = { rect: rectFor(f, 0.7, 0.3) };
  return f;
}

function plant(id, zone, x, z, size = 1) {
  return { id, type: 'plant', zone, x, z, rot: 0, size, colliders: [{ circle: [x, z, 0.3 * size] }], map: { circle: [x, z, 0.28 * size] } };
}

/** Inramat foto på en vägg. wall: 'back' | 'left' | 'right'. */
function photo(id, wall, along, y, w, h, image) {
  const eps = 0.03;
  const p = { back: [along, STORE.minZ + eps, 0], left: [STORE.minX + eps, along, FACE_X], right: [STORE.maxX - eps, along, FACE_NX] }[wall];
  return { id, type: 'photo', zone: null, x: p[0], z: p[1], rot: p[2], y, w, h, image, colliders: [] };
}

/**
 * Flyttar möbler till en annan våning: produktplatserna lyfts med våningshöjden
 * (möblerna själva ritas med y-förskjutning i fixtures/index.jsx).
 */
function onLevel(level, list) {
  const dy = level * FLOOR_H;
  for (const f of list) {
    f.level = level;
    for (const slot of f.slots ?? []) slot.pos = [slot.pos[0], slot.pos[1] + dy, slot.pos[2]];
  }
  return list;
}

// ---------------------------------------------------------------- layout

const { minX, maxX, minZ } = STORE;

export const FIXTURES = [
  // --- Entré: skyltfönster med skyltdockor, podier, skärmar och växter
  platform('win-l', 'entrance', -7.1, 6.85, { w: 6.2 }),
  platform('win-r', 'entrance', 7.1, 6.85, { w: 6.2 }),
  mannequin('mq-1', 'entrance', -9.2, 6.85, 0.25, ['upper', 'lower'], 0.12),
  mannequin('mq-2', 'entrance', -7.1, 6.85, 0, ['full'], 0.12),
  mannequin('mq-3', 'entrance', -5.0, 6.85, -0.25, ['outer', 'lower'], 0.12),
  mannequin('mq-4', 'entrance', 5.0, 6.85, 0.25, ['upper', 'skirt'], 0.12),
  mannequin('mq-5', 'entrance', 7.1, 6.85, 0, ['outer', 'lower'], 0.12),
  mannequin('mq-6', 'entrance', 9.2, 6.85, -0.25, ['full'], 0.12),
  podium('pod-e1', 'entrance', -3.8, 4.5, { pool: 'new' }),
  podium('pod-e2', 'entrance', 3.8, 4.5, { pool: 'new' }),
  screen('scr-1', 'entrance', -2.6, 6.75, R0, { images: [0, 2, 1, 3] }),
  screen('scr-2', 'entrance', 2.6, 6.75, R0, { images: [1, 3, 0, 2] }),
  plant('plant-1', 'entrance', minX + 0.55, 6.9, 1.15),
  plant('plant-2', 'entrance', maxX - 0.55, 6.9, 1.15),
  photo('ph-1', 'left', 5.2, 1.75, 1.3, 1.9, 2),
  photo('ph-2', 'right', 5.2, 1.75, 1.3, 1.9, 3),

  // --- Denim: hyllvägg till vänster, klädstång på bakväggen, bord och ställning
  shelf('sh-1', 'denim', minX, -5.5, FACE_X),
  shelf('sh-2', 'denim', minX, -3.1, FACE_X),
  shelf('sh-3', 'denim', minX, -0.7, FACE_X),
  shelf('sh-4', 'denim', minX, 1.7, FACE_X),
  { id: 'denim-text', type: 'wallText', zone: 'denim', text: 'denim', x: minX + 0.012, z: -1.9, y: 2.55, rot: FACE_X, height: 0.62, colliders: [] },
  wallBay('wb-d1', 'denim', -9.85, minZ, R0, { length: 4.6 }),
  table('tb-d1', 'denim', -9.3, -1.9, FACE_X, { w: 1.8 }),
  freeRail('fr-d1', 'denim', -9.3, 1.6, FACE_X, { length: 1.4 }),

  // --- Toppar: podier i två nivåer, bord och ställning
  podium('pod-t1', 'tops', -5.3, 1.1),
  podium('pod-t2', 'tops', -2.4, -0.9),
  table('tb-t1', 'tops', -2.6, 2.1, R0, { w: 1.6 }),
  freeRail('fr-t1', 'tops', -5.2, -2.3, R0, { length: 1.7 }),
  screen('scr-3', 'tops', -6.4, -0.6, FACE_X, { images: [3, 0, 2, 1] }),

  // --- Accessoarer
  podium('pod-a1', 'accessories', 2.1, -0.9, { pool: 'accessories' }),
  podium('pod-a2', 'accessories', 5.0, 1.1, { pool: 'accessories' }),
  table('tb-a1', 'accessories', 5.1, -2.2, R0, { w: 1.6, pool: 'accessories' }),
  table('tb-a2', 'accessories', 2.2, 2.1, R0, { w: 1.4, pool: 'new' }),

  // --- Rulltrappsområdet: skärm och växt bredvid trapporna (själva trappan: fixtures/Escalator.jsx)
  screen('scr-4', 'escalator', 8.15, 0.6, FACE_X, { images: [2, 1, 3, 0] }),
  plant('plant-6', 'escalator', 8.2, -2.7, 1),
  photo('ph-3', 'right', 0, 2.62, 1.6, 1.05, 4),

  // --- Ytterkläder: bakväggen till höger
  wallBay('wb-y1', 'outerwear', 1.4, minZ, R0),
  wallBay('wb-y2', 'outerwear', 4.1, minZ, R0),
  wallBay('wb-y3', 'outerwear', 6.8, minZ, R0),
  freeRail('fr-y1', 'outerwear', 5.4, -5.0, R0, { length: 2.0 }),
  photo('ph-4', 'back', 2.75, 2.62, 1.55, 1.03, 0),
  photo('ph-5', 'back', 5.45, 2.62, 1.55, 1.03, 1),

  // --- Kassa & provrum
  { id: 'fitting', type: 'fittingRooms', zone: 'checkout', x: -5.5, z: minZ, rot: 0, w: 2.8, d: 1.3, colliders: [{ rect: [-6.95, minZ, -4.05, minZ + 1.32] }], map: { rect: [-6.9, minZ, -4.1, minZ + 1.3] } },
  { id: 'mirror', type: 'tryOnMirror', zone: 'checkout', x: -3.35, z: minZ + 0.02, rot: 0, colliders: [{ rect: [-3.9, minZ, -2.8, minZ + 0.2] }] },
  { id: 'cash', type: 'cashDesk', zone: 'checkout', x: -1.5, z: minZ + 1.45, rot: 0, w: 2.2, d: 0.7, colliders: [{ rect: [-2.65, minZ + 1.05, -0.35, minZ + 1.85] }], map: { rect: [-2.6, minZ + 1.1, -0.4, minZ + 1.8] } },
  { id: 'wall-logo', type: 'wallLogo', zone: 'checkout', x: -1.5, z: minZ + 0.012, y: 2.55, rot: 0, width: 2.2, colliders: [] },
  plant('plant-4', 'checkout', -6.55, -3.95, 0.95),
  plant('plant-5', 'checkout', -0.35, minZ + 0.45, 0.85),

  // ================================================================ ÖVRE PLAN (level 1)
  ...onLevel(1, [
    // --- Klänningar: vänstervägg och bakvägg med klädstänger, ställningar och skyltdockor
    wallBay('u-wb-k1', 'dresses', minX, -5.5, FACE_X),
    wallBay('u-wb-k2', 'dresses', minX, -2.8, FACE_X),
    wallBay('u-wb-k3', 'dresses', minX, -0.1, FACE_X),
    wallBay('u-wb-k4', 'dresses', minX, 2.6, FACE_X),
    wallBay('u-wb-k5', 'dresses', -9.6, minZ, R0),
    wallBay('u-wb-k6', 'dresses', -6.9, minZ, R0),
    wallBay('u-wb-k7', 'dresses', -4.2, minZ, R0),
    wallBay('u-wb-k8', 'dresses', -1.5, minZ, R0),
    freeRail('u-fr-k1', 'dresses', -8.6, 0.6, FACE_X, { length: 1.8 }),
    freeRail('u-fr-k2', 'dresses', -5.6, 3.6, R0, { length: 1.8 }),
    { id: 'u-pl-k1', type: 'roundPlatform', zone: 'dresses', x: -5.4, z: -1.6, rot: 0, r: 0.95, h: 0.12, colliders: [{ circle: [-5.4, -1.6, 0.97] }], map: { circle: [-5.4, -1.6, 0.95] } },
    mannequin('u-mq-1', 'dresses', -5.75, -1.6, 0.35, ['full'], 0.12),
    mannequin('u-mq-2', 'dresses', -5.05, -1.6, -0.35, ['full'], 0.12),
    podium('u-pod-k1', 'dresses', -2.4, 0.6),
    photo('u-ph-1', 'left', 5.6, 1.75, 1.3, 1.9, 2),
    plant('u-plant-1', 'dresses', minX + 0.55, 6.9, 1.15),
    plant('u-plant-2', 'dresses', -0.4, minZ + 0.5, 0.95),

    // --- Fest & nyheter: bakvägg, podier, bord och skyltdockor vid rulltrappan
    wallBay('u-wb-p1', 'party', 1.4, minZ, R0, { pool: 'new' }),
    wallBay('u-wb-p2', 'party', 4.1, minZ, R0, { pool: 'new' }),
    // (bakväggen x 5,5–12,5 hålls fri för rulltrappan upp till plan 3)
    wallBay('u-wb-p5', 'party', maxX, -5.6, FACE_NX, { pool: 'new' }),
    podium('u-pod-p1', 'party', 2.6, 1.0, { pool: 'new' }),
    podium('u-pod-p2', 'party', 3.0, -2.9, { pool: 'new' }),
    table('u-tb-p1', 'party', 3.6, 4.7, R0, { w: 1.7, pool: 'accessories' }),
    platform('u-win-1', 'party', 7.3, 5.3, { w: 3.2, d: 0.95 }),
    mannequin('u-mq-3', 'party', 6.3, 5.3, 0.2, ['outer', 'lower'], 0.12),
    mannequin('u-mq-4', 'party', 7.3, 5.3, 0, ['full'], 0.12),
    mannequin('u-mq-5', 'party', 8.3, 5.3, -0.2, ['upper', 'skirt'], 0.12),
    screen('u-scr-1', 'party', 11.6, 5.6, FACE_NX, { images: [0, 3, 1, 2] }),
    // lodrät logotyp ovanför rulltrapporna, som i butikens referensbild
    { id: 'u-logo', type: 'wallLogo', zone: 'party', x: maxX - 0.012, z: -0.9, y: 1.85, rot: FACE_NX, width: 3.0, vertical: true, colliders: [] },
    photo('u-ph-2', 'right', 4.1, 1.75, 1.2, 1.7, 3),
    plant('u-plant-3', 'party', maxX - 0.55, 6.9, 1.15),
    plant('u-plant-4', 'party', 0.6, 6.9, 1.0),
  ]),

  // ================================================================ PLAN 3 (level 2)
  ...onLevel(2, [
    // --- Tröjor & stickat: hyllvägg med vikt stickat, bakvägg, bord och podier
    shelf('t-sh-1', 'knit', minX, -5.5, FACE_X),
    shelf('t-sh-2', 'knit', minX, -3.1, FACE_X),
    shelf('t-sh-3', 'knit', minX, -0.7, FACE_X),
    shelf('t-sh-4', 'knit', minX, 1.7, FACE_X),
    { id: 't-text', type: 'wallText', zone: 'knit', text: 'stickat', x: minX + 0.012, z: -1.9, y: 2.55, rot: FACE_X, height: 0.62, colliders: [] },
    wallBay('t-wb-k1', 'knit', -9.6, minZ, R0),
    wallBay('t-wb-k2', 'knit', -6.9, minZ, R0),
    wallBay('t-wb-k3', 'knit', -4.2, minZ, R0),
    wallBay('t-wb-k4', 'knit', -1.5, minZ, R0),
    table('t-tb-k1', 'knit', -8.8, -1.4, FACE_X, { w: 1.8 }),
    table('t-tb-k2', 'knit', -5.2, 3.4, R0, { w: 1.7 }),
    podium('t-pod-k1', 'knit', -5.4, -1.2),
    podium('t-pod-k2', 'knit', -2.2, 0.9),
    freeRail('t-fr-k1', 'knit', -8.8, 2.6, FACE_X, { length: 1.4 }),
    platform('t-win-1', 'knit', -2.4, 5.5, { w: 3.2, d: 0.95 }),
    mannequin('t-mq-1', 'knit', -3.4, 5.5, 0.2, ['upper', 'lower'], 0.12),
    mannequin('t-mq-2', 'knit', -2.4, 5.5, 0, ['outer', 'lower'], 0.12),
    mannequin('t-mq-3', 'knit', -1.4, 5.5, -0.2, ['upper', 'skirt'], 0.12),
    photo('t-ph-1', 'left', 5.6, 1.75, 1.3, 1.9, 0),
    plant('t-plant-1', 'knit', minX + 0.55, 6.9, 1.15),
    plant('t-plant-2', 'knit', -0.4, minZ + 0.5, 0.95),

    // --- Byxor & kostym: väggar med klädstänger, ställningar och skärm
    wallBay('t-wb-b1', 'trousers', 1.4, minZ, R0),
    wallBay('t-wb-b2', 'trousers', 4.1, minZ, R0),
    wallBay('t-wb-b3', 'trousers', 6.8, minZ, R0),
    wallBay('t-wb-b4', 'trousers', 9.5, minZ, R0),
    wallBay('t-wb-b5', 'trousers', maxX, -4.6, FACE_NX),
    wallBay('t-wb-b6', 'trousers', maxX, -1.9, FACE_NX),
    freeRail('t-fr-b1', 'trousers', 3.0, -3.2, R0, { length: 1.8 }),
    freeRail('t-fr-b2', 'trousers', 10.4, 1.0, FACE_X, { length: 1.8 }),
    podium('t-pod-b1', 'trousers', 3.0, 1.2, { pool: 'new' }),
    table('t-tb-b1', 'trousers', 10.2, 5.0, R0, { w: 1.7, pool: 'accessories' }),
    screen('t-scr-1', 'trousers', 5.2, 5.8, R0, { images: [1, 2, 3, 0] }),
    { id: 't-logo', type: 'wallLogo', zone: 'trousers', x: maxX - 0.012, z: 3.6, y: 2.4, rot: FACE_NX, width: 2.4, colliders: [] },
    photo('t-ph-2', 'right', 5.9, 1.75, 1.2, 1.7, 1),
    plant('t-plant-3', 'trousers', maxX - 0.55, 6.9, 1.15),
    plant('t-plant-4', 'trousers', 0.6, 6.9, 1.0),
  ]),
];
