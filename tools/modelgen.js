/**
 * Modellgenerator: bygger butikspersonal som riggade, animerade 3D-modeller och
 * exporterar dem som .glb. Körs i webbläsaren via `npm run models`
 * (scripts/build-models.mjs öppnar tools/modelgen.html med Playwright).
 *
 * Varje modell: skinnad mesh (17 ben), material för hud/hår/kläder,
 * animationerna "Walk", "Idle" och "Talk". Framsidan mot +Z, fötterna vid y = 0,
 * meter som enhet.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));

// ------------------------------------------------------------------ skelett
const BONES = [
  ['Hips', null, [0, 0.95, 0]],
  ['Spine', 'Hips', [0, 1.12, 0]],
  ['Chest', 'Spine', [0, 1.3, 0]],
  ['Neck', 'Chest', [0, 1.49, 0]],
  ['Head', 'Neck', [0, 1.57, 0]],
  ['UpperArm.L', 'Chest', [0.185, 1.43, 0]],
  ['ForeArm.L', 'UpperArm.L', [0.205, 1.15, -0.01]],
  ['Hand.L', 'ForeArm.L', [0.215, 0.9, 0.01]],
  ['UpperArm.R', 'Chest', [-0.185, 1.43, 0]],
  ['ForeArm.R', 'UpperArm.R', [-0.205, 1.15, -0.01]],
  ['Hand.R', 'ForeArm.R', [-0.215, 0.9, 0.01]],
  ['Thigh.L', 'Hips', [0.09, 0.92, 0]],
  ['Shin.L', 'Thigh.L', [0.09, 0.5, 0.01]],
  ['Foot.L', 'Shin.L', [0.09, 0.085, 0]],
  ['Thigh.R', 'Hips', [-0.09, 0.92, 0]],
  ['Shin.R', 'Thigh.R', [-0.09, 0.5, 0.01]],
  ['Foot.R', 'Shin.R', [-0.09, 0.085, 0]],
];
const BI = Object.fromEntries(BONES.map(([n], i) => [n, i]));

function buildSkeleton(scaleY) {
  const bones = [];
  const worldPos = {};
  for (const [name, parent, p] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const wp = new THREE.Vector3(p[0], p[1] * scaleY, p[2]);
    worldPos[name] = wp;
    if (parent) {
      b.position.copy(wp).sub(worldPos[parent]);
      bones[BI[parent]].add(b);
    } else b.position.copy(wp);
    bones.push(b);
  }
  return { bones, skeleton: new THREE.Skeleton(bones) };
}

// ------------------------------------------------------------------ geometri-hjälp
/** Sätter skinIndex/skinWeight: en eller två ben (mjuk övergång vid leder). */
function skin(geom, boneFn) {
  const g = geom; // indexerad geometri håller filen liten
  const p = g.attributes.position;
  const idx = new Uint16Array(p.count * 4);
  const w = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const r = boneFn(p.getX(i), p.getY(i), p.getZ(i));
    const [a, b, t] = Array.isArray(r) ? r : [r, r, 0];
    idx[i * 4] = BI[a];
    idx[i * 4 + 1] = BI[b];
    w[i * 4] = 1 - t;
    w[i * 4 + 1] = t;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  g.deleteAttribute('tangent');
  return g;
}

/** Lem: avsmalnande, rundad cylinder mellan två punkter. */
function limb(a, b, r0, r1, seg = 14) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 6, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}
const sphere = (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 20) => {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
};
const lathe = (pts, sz = 1, seg = 32) => {
  const g = new THREE.LatheGeometry(V2(pts), seg);
  g.scale(1, 1, sz);
  return g;
};
/** Blandning mellan två ben runt en höjd (mjuk led). */
const blendY = (lo, hi, y0, band = 0.05) => (x, y) => {
  const t = THREE.MathUtils.clamp((y - (y0 - band)) / (2 * band), 0, 1);
  return [lo, hi, t];
};
const side = (x) => (x >= 0 ? 'L' : 'R');

// ------------------------------------------------------------------ personen
function buildPerson(cfg) {
  const S = cfg.height / 1.7;
  const fem = cfg.body === 'f';
  const { bones, skeleton } = buildSkeleton(S);
  const parts = []; // { geom, mat }
  const mats = {
    skin: new THREE.MeshStandardMaterial({ name: 'Skin', color: cfg.skin, roughness: 0.55 }),
    hair: new THREE.MeshStandardMaterial({ name: 'Hair', color: cfg.hair, roughness: 0.45, metalness: 0.05 }),
    top: new THREE.MeshStandardMaterial({ name: 'Top', color: cfg.top, roughness: 0.85 }),
    bottom: new THREE.MeshStandardMaterial({ name: 'Bottom', color: cfg.bottom, roughness: 0.8 }),
    shoe: new THREE.MeshStandardMaterial({ name: 'Shoes', color: cfg.shoes, roughness: 0.4 }),
    eye: new THREE.MeshStandardMaterial({ name: 'EyeWhite', color: '#f4f2ee', roughness: 0.2 }),
    iris: new THREE.MeshStandardMaterial({ name: 'Iris', color: cfg.eyes, roughness: 0.1 }),
    brow: new THREE.MeshStandardMaterial({ name: 'Brow', color: cfg.brows ?? cfg.hair, roughness: 0.8 }),
    lips: new THREE.MeshStandardMaterial({ name: 'Lips', color: cfg.lips, roughness: 0.5 }),
    tag: new THREE.MeshStandardMaterial({ name: 'NameTag', color: '#ffffff', roughness: 0.4 }),
    tagText: new THREE.MeshStandardMaterial({ name: 'NameTagText', color: '#111111', roughness: 0.4 }),
  };
  const add = (geom, mat, bone) => parts.push({ geom: skin(geom, typeof bone === 'function' ? bone : () => bone), mat });
  const P = (x, y, z) => new THREE.Vector3(x, y * S, z);

  // --- ben och skor
  for (const s of [1, -1]) {
    const L = side(s);
    const hip = P(0.09 * s, 0.93, 0), knee = P(0.09 * s, 0.5, 0.01), ankle = P(0.09 * s, 0.085, 0);
    // Låret börjar inne i bäckenet och viktas mjukt mellan höft och lår, så att
    // benet böjer sig i höftleden i stället för att svänga ut ur kroppen.
    const thighTop = P(0.088 * s, 0.97, 0);
    add(limb(thighTop, knee, fem ? 0.078 : 0.084, fem ? 0.056 : 0.062), mats.bottom, (x, y) => {
      if (y > knee.y + 0.08 * S) {
        const t = THREE.MathUtils.clamp((0.97 * S - y) / (0.14 * S), 0, 1);
        return ['Hips', `Thigh.${L}`, t];
      }
      return blendY(`Thigh.${L}`, `Shin.${L}`, knee.y, 0.035)(x, y);
    });
    add(sphere(fem ? 0.058 : 0.063, knee.x, knee.y, knee.z), mats.bottom, `Shin.${L}`);
    add(limb(knee, ankle, fem ? 0.054 : 0.06, fem ? 0.04 : 0.045), mats.bottom, `Shin.${L}`);
    const shoe = new THREE.CapsuleGeometry(0.045, 0.16, 6, 14);
    shoe.rotateX(Math.PI / 2);
    shoe.scale(fem ? 0.95 : 1.1, 0.8, 1);
    shoe.translate(ankle.x, 0.045, 0.045);
    add(shoe, mats.shoe, `Foot.${L}`);
  }
  // --- bäcken/byxlinning
  add(lathe([[0.001, 0.86 * S], [0.13, 0.86 * S], [fem ? 0.165 : 0.155, 0.92 * S], [fem ? 0.165 : 0.157, 0.99 * S], [fem ? 0.148 : 0.152, 1.05 * S], [0.001, 1.06 * S]], 0.74), mats.bottom, (x, y) => {
    // byxans nedre del följer med låren en bit (mjuk övergång vid grenen/höften)
    if (y < 0.95 * S) return ['Hips', `Thigh.${side(x)}`, THREE.MathUtils.clamp((0.95 * S - y) / (0.09 * S), 0, 1) * 0.65];
    return blendY('Hips', 'Spine', 1.04 * S, 0.03)(x, y);
  });
  // --- överkropp (topp/tröja)
  const torso = fem
    ? [[0.001, 1.0], [0.15, 1.0], [0.142, 1.08], [0.128, 1.16], [0.127, 1.22], [0.148, 1.3], [0.152, 1.35], [0.15, 1.4], [0.14, 1.45], [0.1, 1.49], [0.055, 1.5], [0.001, 1.5]]
    : [[0.001, 1.0], [0.152, 1.0], [0.15, 1.08], [0.148, 1.16], [0.155, 1.25], [0.168, 1.33], [0.172, 1.39], [0.165, 1.45], [0.12, 1.49], [0.06, 1.51], [0.001, 1.51]];
  add(lathe(torso.map(([r, y]) => [r, y * S]), fem ? 0.68 : 0.7), mats.top, blendY('Spine', 'Chest', 1.24 * S, 0.06));
  // axlar
  for (const s of [1, -1]) add(sphere(fem ? 0.058 : 0.068, 0.16 * s, 1.425 * S, 0, 1.1, 0.95, 0.9), mats.top, () => ['Chest', `UpperArm.${side(s)}`, 0.55]);
  // --- armar (långärmat), händer
  for (const s of [1, -1]) {
    const L = side(s);
    const sh = P(0.185 * s, 1.43, 0), el = P(0.205 * s, 1.15, -0.01), wr = P(0.215 * s, 0.91, 0.01);
    add(limb(sh, el, fem ? 0.045 : 0.052, fem ? 0.038 : 0.045), mats.top, (x, y) => {
      if (y > 1.33 * S) return ['Chest', `UpperArm.${L}`, THREE.MathUtils.clamp((1.45 * S - y) / (0.12 * S), 0.35, 1)];
      return blendY(`UpperArm.${L}`, `ForeArm.${L}`, el.y, 0.03)(x, y);
    });
    add(sphere(fem ? 0.038 : 0.044, el.x, el.y, el.z), mats.top, `ForeArm.${L}`);
    add(limb(el, wr, fem ? 0.036 : 0.042, fem ? 0.03 : 0.034), mats.top, `ForeArm.${L}`);
    const hand = new THREE.CapsuleGeometry(fem ? 0.026 : 0.03, 0.06, 4, 10);
    hand.scale(1, 1, 0.55);
    hand.translate(wr.x * 1.01, wr.y - 0.06, wr.z + 0.005);
    add(hand, mats.skin, `Hand.${L}`);
  }
  // --- hals och huvud
  add(limb(P(0, 1.47, 0), P(0, 1.58, 0.005), fem ? 0.046 : 0.055, fem ? 0.042 : 0.05), mats.skin, blendY('Neck', 'Head', 1.56 * S, 0.02));
  const hy = 1.665 * S;
  const head = new THREE.LatheGeometry(V2([[0.001, -0.115], [0.045, -0.11], [0.07, -0.085], [0.083, -0.04], [0.09, 0.01], [0.092, 0.05], [0.083, 0.09], [0.06, 0.115], [0.03, 0.127], [0.001, 0.13]]), 28);
  head.scale(fem ? 0.93 : 1, 1, 1.08);
  head.translate(0, hy, 0.005);
  add(head, mats.skin, 'Head');
  // ansikte
  add(sphere(0.012, 0, hy - 0.005, 0.103, 0.9, 1.6, 1.1, 10), mats.skin, 'Head'); // näsa
  for (const s of [1, -1]) {
    add(sphere(0.0115, 0.033 * s, hy + 0.02, 0.086, 1.2, 0.85, 0.6, 12), mats.eye, 'Head');
    add(sphere(0.0065, 0.033 * s, hy + 0.02, 0.092, 1, 1, 0.5, 10), mats.iris, 'Head');
    const brow = new THREE.CapsuleGeometry(0.004, 0.026, 3, 6);
    brow.rotateZ(Math.PI / 2 + 0.12 * s);
    brow.translate(0.034 * s, hy + 0.043, 0.09);
    add(brow, mats.brow, 'Head');
    add(sphere(0.017, 0.088 * s, hy + 0.0, 0.005, 0.5, 1.2, 0.8, 10), mats.skin, 'Head'); // öron
  }
  add(sphere(0.019, 0, hy - 0.045, 0.088, 1.1, 0.42, 0.5, 12), mats.lips, 'Head');
  // hår
  if (cfg.hairStyle === 'long' || cfg.hairStyle === 'ponytail' || cfg.hairStyle === 'bun') {
    // hårfäste över hela hjässan, lite bakåt så att pannan syns
    add(sphere(0.1, 0, hy + 0.045, -0.008, 1.02, 0.98, 1.1, 26), mats.hair, 'Head');
    // sidbena/lugg som ramar in ansiktet
    add(sphere(0.075, 0.02, hy + 0.088, 0.04, 1.25, 0.42, 0.95, 18), mats.hair, 'Head');
    for (const s of [1, -1]) add(sphere(0.03, 0.078 * s, hy + 0.0, 0.03, 0.55, 1.9, 0.9, 12), mats.hair, 'Head');
  } else {
    add(sphere(0.097, 0, hy + 0.05, -0.006, 1.02, 0.82, 1.1, 24), mats.hair, 'Head');
  }
  if (cfg.hairStyle === 'long') {
    const back = new THREE.CapsuleGeometry(0.075, 0.2, 6, 16);
    back.scale(1.25, 1, 0.55);
    back.translate(0, hy - 0.11, -0.065);
    add(back, mats.hair, blendY('Neck', 'Head', hy - 0.06, 0.06));
  } else if (cfg.hairStyle === 'ponytail') {
    const tail = new THREE.CapsuleGeometry(0.028, 0.17, 4, 10);
    tail.rotateX(0.35);
    tail.translate(0, hy - 0.05, -0.115);
    add(tail, mats.hair, 'Head');
  } else if (cfg.hairStyle === 'bun') {
    add(sphere(0.045, 0, hy + 0.11, -0.075, 1, 0.9, 1, 14), mats.hair, 'Head');
  }
  // namnskylt
  const tag = new THREE.BoxGeometry(0.075, 0.025, 0.006);
  tag.translate(0.075, 1.37 * S, (fem ? 0.104 : 0.122));
  add(tag, mats.tag, 'Chest');
  const line = new THREE.BoxGeometry(0.05, 0.005, 0.002);
  line.translate(0.075, 1.37 * S, (fem ? 0.108 : 0.126));
  add(line, mats.tagText, 'Chest');

  // --- slå ihop till en skinnad mesh med materialgrupper
  const geom = mergeGeometries(parts.map((p) => p.geom), true);
  const mesh = new THREE.SkinnedMesh(geom, parts.map((p) => p.mat));
  mesh.name = `${cfg.name}_Body`;
  const root = new THREE.Group();
  root.name = cfg.name;
  root.add(bones[0]);
  root.add(mesh);
  // benens världsmatriser måste vara uträknade innan bind-posen sparas
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);
  root.userData = { staffName: cfg.displayName, role: 'Butikspersonal' };
  return { root, bones, S };
}

// ------------------------------------------------------------------ animationer
const deg = THREE.MathUtils.degToRad;
const qx = (a) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
const qe = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function rotTrack(bone, times, quats) {
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, quats.flatMap((q) => q.toArray()));
}

function walkClip(S, armRest) {
  const T = 1.1, n = 12;
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * T);
  const ph = times.map((t) => (t / T) * Math.PI * 2);
  const tracks = [];
  for (const [L, off] of [['L', 0], ['R', Math.PI]]) {
    tracks.push(rotTrack(`Thigh.${L}`, times, ph.map((p) => qx(-deg(19) * Math.sin(p + off)))));
    tracks.push(rotTrack(`Shin.${L}`, times, ph.map((p) => qx(deg(6) + deg(26) * Math.max(0, Math.sin(p + off + 1.2))))));
    tracks.push(rotTrack(`Foot.${L}`, times, ph.map((p) => qx(deg(10) * Math.sin(p + off - 0.6)))));
    const s = L === 'L' ? 1 : -1;
    tracks.push(rotTrack(`UpperArm.${L}`, times, ph.map((p) => qe(deg(20) * Math.sin(p + off), 0, s * armRest))));
    tracks.push(rotTrack(`ForeArm.${L}`, times, ph.map((p) => qx(-deg(12) - deg(10) * Math.max(0, Math.sin(p + off))))));
  }
  tracks.push(rotTrack('Spine', times, ph.map((p) => qe(deg(2), deg(5) * Math.sin(p), 0))));
  tracks.push(rotTrack('Chest', times, ph.map((p) => qe(0, -deg(4) * Math.sin(p), 0))));
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, ph.flatMap((p) => [0, 0.95 * S + 0.018 * Math.abs(Math.cos(p)), 0])));
  return new THREE.AnimationClip('Walk', T, tracks);
}

function idleClip(S, armRest) {
  const T = 4, n = 16;
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * T);
  const ph = times.map((t) => (t / T) * Math.PI * 2);
  const tracks = [
    rotTrack('Chest', times, ph.map((p) => qe(deg(1.5) * Math.sin(p * 2), 0, 0))),
    rotTrack('Head', times, ph.map((p) => qe(deg(2) * Math.sin(p * 2 + 1), deg(9) * Math.sin(p), 0))),
    rotTrack('UpperArm.L', times, ph.map((p) => qe(deg(2) * Math.sin(p), 0, armRest + deg(1) * Math.sin(p * 2)))),
    rotTrack('UpperArm.R', times, ph.map((p) => qe(deg(2) * Math.sin(p + 1), 0, -armRest - deg(1) * Math.sin(p * 2)))),
    rotTrack('ForeArm.L', times, ph.map(() => qx(-deg(10)))),
    rotTrack('ForeArm.R', times, ph.map(() => qx(-deg(10)))),
    rotTrack('Thigh.L', times, ph.map((p) => qe(0, 0, deg(1.5) * Math.sin(p)))),
    rotTrack('Thigh.R', times, ph.map((p) => qe(0, 0, deg(1.5) * Math.sin(p)))),
    new THREE.VectorKeyframeTrack('Hips.position', times, ph.flatMap((p) => [0.012 * Math.sin(p), 0.95 * S - 0.004 * Math.abs(Math.sin(p)), 0])),
  ];
  return new THREE.AnimationClip('Idle', T, tracks);
}

function talkClip(S, armRest) {
  const T = 2.4, n = 12;
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * T);
  const ph = times.map((t) => (t / T) * Math.PI * 2);
  const tracks = [
    // höger hand gestikulerar, huvudet nickar lätt
    rotTrack('UpperArm.R', times, ph.map((p) => qe(-deg(28) - deg(6) * Math.sin(p * 2), 0, -armRest - deg(6)))),
    rotTrack('ForeArm.R', times, ph.map((p) => qe(-deg(70) - deg(12) * Math.sin(p * 2), deg(10) * Math.sin(p * 2), 0))),
    rotTrack('Hand.R', times, ph.map((p) => qe(0, 0, deg(15) * Math.sin(p * 2)))),
    rotTrack('UpperArm.L', times, ph.map(() => qe(0, 0, armRest))),
    rotTrack('ForeArm.L', times, ph.map(() => qx(-deg(12)))),
    rotTrack('Head', times, ph.map((p) => qe(deg(4) * Math.sin(p * 2), deg(5) * Math.sin(p), 0))),
    rotTrack('Chest', times, ph.map((p) => qe(deg(1) * Math.sin(p * 2), 0, 0))),
  ];
  return new THREE.AnimationClip('Talk', T, tracks);
}

// ------------------------------------------------------------------ personalen
export const STAFF = [
  { name: 'staff-emma', displayName: 'Emma', body: 'f', height: 1.69, skin: '#e8c3a6', hair: '#3b2a20', hairStyle: 'long', eyes: '#4a3526', lips: '#b9706a', top: '#151515', bottom: '#151515', shoes: '#0d0d0d' },
  { name: 'staff-sara', displayName: 'Sara', body: 'f', height: 1.65, skin: '#8d5a3b', hair: '#1b1411', hairStyle: 'bun', eyes: '#2b1d14', lips: '#7a4038', top: '#efe8dc', bottom: '#151515', shoes: '#efe8dc' },
  { name: 'staff-ali', displayName: 'Ali', body: 'm', height: 1.8, skin: '#c99a76', hair: '#1c1612', hairStyle: 'short', eyes: '#2e2218', lips: '#a0675c', top: '#151515', bottom: '#2b2b2b', shoes: '#111111' },
  { name: 'staff-maja', displayName: 'Maja', body: 'f', height: 1.67, skin: '#d9a985', hair: '#5a3524', hairStyle: 'ponytail', eyes: '#3b2a1e', lips: '#a8645c', top: '#efe8dc', bottom: '#151515', shoes: '#151515' },
  { name: 'staff-linnea', displayName: 'Linnéa', body: 'f', height: 1.72, skin: '#f0d2bd', hair: '#c9a46a', hairStyle: 'ponytail', eyes: '#3d5a73', lips: '#c27d78', top: '#151515', bottom: '#efe8dc', shoes: '#151515' },
];

export async function exportStaff(cfg) {
  const { root, S } = buildPerson(cfg);
  const armRest = deg(cfg.body === 'f' ? 4 : 5);
  const clips = [walkClip(S, armRest), idleClip(S, armRest), talkClip(S, armRest)];
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buf = await exporter.parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
  return { name: cfg.name, bytes: new Uint8Array(buf) };
}

// Körs av tools/modelgen.html
window.__buildModels = async () => {
  const out = [];
  for (const cfg of STAFF) {
    const { name, bytes } = await exportStaff(cfg);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ name, base64: btoa(bin), size: bytes.length });
  }
  return out;
};
