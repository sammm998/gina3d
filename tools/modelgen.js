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
function limb(a, b, r0, r1, seg = 22) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 4, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}
const sphere = (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 16) => {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
};
const lathe = (pts, sz = 1, seg = 44) => {
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
    skin: new THREE.MeshPhysicalMaterial({ name: 'Skin', color: cfg.skin, roughness: 0.58, sheen: 0.45, sheenColor: new THREE.Color('#ffb59c'), sheenRoughness: 0.55 }),
    sole: new THREE.MeshStandardMaterial({ name: 'Sole', color: cfg.sole ?? '#d8d4cc', roughness: 0.7 }),
    belt: new THREE.MeshStandardMaterial({ name: 'Belt', color: cfg.belt ?? '#2a1c14', roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ name: 'Buckle', color: '#c9b58a', metalness: 0.9, roughness: 0.3 }),
    lash: new THREE.MeshStandardMaterial({ name: 'Lashes', color: '#120c0a', roughness: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ name: 'Hair', color: cfg.hair, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide }),
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
    shoe.translate(ankle.x, 0.05, 0.045);
    add(shoe, mats.shoe, `Foot.${L}`);
    const sole = new THREE.CapsuleGeometry(0.046, 0.165, 4, 14);
    sole.rotateX(Math.PI / 2);
    sole.scale(fem ? 1.0 : 1.14, 0.22, 1.02);
    sole.translate(ankle.x, 0.012, 0.045);
    add(sole, mats.sole, `Foot.${L}`);
    // byxans fåll
    const hem = new THREE.TorusGeometry(fem ? 0.043 : 0.048, 0.006, 6, 20);
    hem.rotateX(Math.PI / 2);
    hem.translate(ankle.x, ankle.y + 0.02, ankle.z);
    add(hem, mats.bottom, `Shin.${L}`);
  }
  // --- bäcken/byxlinning
  add(lathe([[0.001, 0.86 * S], [0.13, 0.86 * S], [fem ? 0.165 : 0.155, 0.92 * S], [fem ? 0.165 : 0.157, 0.99 * S], [fem ? 0.148 : 0.152, 1.05 * S], [0.001, 1.06 * S]], 0.74), mats.bottom, (x, y) => {
    // byxans nedre del följer med låren en bit (mjuk övergång vid grenen/höften)
    if (y < 0.95 * S) return ['Hips', `Thigh.${side(x)}`, THREE.MathUtils.clamp((0.95 * S - y) / (0.09 * S), 0, 1) * 0.65];
    return blendY('Hips', 'Spine', 1.04 * S, 0.03)(x, y);
  });
  // skärp med spänne
  const belt = new THREE.TorusGeometry(1, 0.012, 6, 48);
  belt.rotateX(Math.PI / 2);
  belt.scale(fem ? 0.152 : 0.156, 1, (fem ? 0.152 : 0.156) * 0.74);
  belt.translate(0, 1.005 * S, 0);
  add(belt, mats.belt, blendY('Hips', 'Spine', 1.04 * S, 0.03));
  const buckle = new THREE.BoxGeometry(0.035, 0.025, 0.006);
  buckle.translate(0, 1.005 * S, (fem ? 0.152 : 0.156) * 0.74 + 0.006);
  add(buckle, mats.metal, 'Hips');
  // --- överkropp (topp/tröja)
  const torso = fem
    ? [[0.001, 1.0], [0.15, 1.0], [0.142, 1.08], [0.128, 1.16], [0.127, 1.22], [0.148, 1.3], [0.152, 1.35], [0.15, 1.4], [0.14, 1.45], [0.1, 1.49], [0.055, 1.5], [0.001, 1.5]]
    : [[0.001, 1.0], [0.152, 1.0], [0.15, 1.08], [0.148, 1.16], [0.155, 1.25], [0.168, 1.33], [0.172, 1.39], [0.165, 1.45], [0.12, 1.49], [0.06, 1.51], [0.001, 1.51]];
  add(lathe(torso.map(([r, y]) => [r, y * S]), fem ? 0.68 : 0.7), mats.top, blendY('Spine', 'Chest', 1.24 * S, 0.06));
  // rund halsringning/krage
  const collar = new THREE.TorusGeometry(fem ? 0.052 : 0.06, 0.011, 8, 28);
  collar.rotateX(Math.PI / 2 - 0.15);
  collar.translate(0, 1.49 * S, 0.006);
  add(collar, mats.top, () => ['Chest', 'Neck', 0.3]);
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
    const cuff = new THREE.TorusGeometry(fem ? 0.031 : 0.035, 0.006, 6, 18);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(wr.x, wr.y + 0.012, wr.z);
    add(cuff, mats.top, `ForeArm.${L}`);
    // handflata + fyra fingrar + tumme (handflatan mot kroppen)
    const k = fem ? 1 : 1.12;
    const palm = new THREE.CapsuleGeometry(0.022 * k, 0.045 * k, 4, 12);
    palm.scale(0.55, 1, 1.2);
    palm.translate(wr.x * 1.01, wr.y - 0.045 * k, wr.z + 0.004);
    add(palm, mats.skin, `Hand.${L}`);
    [-0.016, -0.005, 0.006, 0.016].forEach((dz, fi) => {
      const len = (fi === 0 || fi === 3 ? 0.04 : 0.05) * k;
      const finger = new THREE.CapsuleGeometry(0.0062 * k, len, 3, 8);
      finger.rotateZ(-s * 0.06);
      finger.translate(wr.x * 1.012 - s * 0.003, wr.y - 0.085 * k - len / 2, wr.z + dz * k + 0.004);
      add(finger, mats.skin, `Hand.${L}`);
    });
    const thumb = new THREE.CapsuleGeometry(0.0075 * k, 0.035 * k, 3, 8);
    thumb.rotateX(0.5);
    thumb.translate(wr.x * 1.0 + s * 0.006, wr.y - 0.05 * k, wr.z + 0.026 * k);
    add(thumb, mats.skin, `Hand.${L}`);
  }
  // --- hals och huvud
  add(limb(P(0, 1.47, 0), P(0, 1.58, 0.005), fem ? 0.046 : 0.055, fem ? 0.042 : 0.05), mats.skin, blendY('Neck', 'Head', 1.56 * S, 0.02));
  const hy = 1.665 * S;
  // Huvudet: jämn profil som sedan "skulpteras" – näsa, ögonhålor, kindben,
  // käke och haka formas direkt i ytan (inga påklistrade delar).
  const prof = new THREE.SplineCurve(V2([[0.001, -0.118], [0.04, -0.112], [0.066, -0.088], [0.081, -0.045], [0.089, 0.005], [0.092, 0.05], [0.085, 0.088], [0.064, 0.114], [0.032, 0.128], [0.001, 0.132]]));
  const head = new THREE.LatheGeometry(prof.getPoints(40), 48);
  head.rotateY(Math.PI); // lathe-sömmen hamnar i nacken, inte mitt i ansiktet
  head.scale(fem ? 0.93 : 1, 1, 1.08);
  {
    const p = head.attributes.position;
    const gauss = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2) / (2 * sx * sx) - ((y - cy) ** 2) / (2 * sy * sy));
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = THREE.MathUtils.clamp(z / 0.09, 0, 1); // 1 rakt fram
      // käke och haka: smalare nertill, hakan något framåt
      const jaw = THREE.MathUtils.clamp((-0.035 - y) / 0.075, 0, 1);
      x *= 1 - 0.22 * jaw;
      z += 0.01 * gauss(x, y, 0, -0.088, 0.03, 0.02) * front;
      // näsa
      z += (0.021 * gauss(x, y, 0, -0.01, 0.0105, 0.022) + 0.007 * gauss(x, y, 0, 0.018, 0.007, 0.02)) * front;
      // ögonhålor och kindben
      for (const s of [1, -1]) {
        z -= 0.0045 * gauss(x, y, 0.033 * s, 0.02, 0.015, 0.011) * front;
        const cheek = 0.005 * gauss(x, y, 0.05 * s, -0.012, 0.022, 0.02) * front;
        x += cheek * s;
        z += cheek * 0.6;
      }
      // munområdet lite framåt, panna något platt
      z += 0.004 * gauss(x, y, 0, -0.045, 0.025, 0.015) * front;
      p.setXYZ(i, x, y, z);
    }
    head.computeVertexNormals();
  }
  head.translate(0, hy, 0.005);
  add(head, mats.skin, 'Head');
  // ansikte

  for (const s of [1, -1]) {
    add(sphere(0.0118, 0.033 * s, hy + 0.02, 0.0885, 1.25, 0.85, 0.6, 14), mats.eye, 'Head');
    add(sphere(0.0064, 0.033 * s, hy + 0.019, 0.0945, 1, 1, 0.45, 12), mats.iris, 'Head');
    // övre ögonlock och fransar
    const lid = new THREE.SphereGeometry(0.0125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3);
    lid.scale(1.3, 0.45, 0.7);
    lid.translate(0.033 * s, hy + 0.027, 0.088);
    add(lid, mats.skin, 'Head');
    const lash = new THREE.CapsuleGeometry(0.0016, 0.022, 2, 6);
    lash.rotateZ(Math.PI / 2 + 0.08 * s);
    lash.translate(0.033 * s, hy + 0.03, 0.096);
    add(lash, mats.lash, 'Head');
    const brow = new THREE.CapsuleGeometry(0.004, 0.026, 3, 6);
    brow.rotateZ(Math.PI / 2 + 0.12 * s);
    brow.translate(0.034 * s, hy + 0.043, 0.09);
    add(brow, mats.brow, 'Head');
    add(sphere(0.017, 0.088 * s, hy + 0.0, 0.005, 0.5, 1.2, 0.8, 10), mats.skin, 'Head'); // öron
  }
  add(sphere(0.018, 0, hy - 0.04, 0.0985, 1.15, 0.32, 0.42, 14), mats.lips, 'Head'); // överläpp
  add(sphere(0.017, 0, hy - 0.05, 0.097, 1.05, 0.36, 0.45, 14), mats.lips, 'Head'); // underläpp
  // hår
  if (cfg.hairStyle === 'long' || cfg.hairStyle === 'ponytail' || cfg.hairStyle === 'bun') {
    // hårfäste över hela hjässan, lite bakåt så att pannan syns
    add(sphere(0.102, 0, hy + 0.05, -0.028, 1.02, 0.98, 1.04, 26), mats.hair, 'Head');
    // sidbena/lugg som ramar in ansiktet
    add(sphere(0.075, 0.02, hy + 0.088, 0.04, 1.25, 0.42, 0.95, 18), mats.hair, 'Head');
  } else {
    add(sphere(0.099, 0, hy + 0.052, -0.026, 1.02, 0.84, 1.05, 24), mats.hair, 'Head');
    // kort frisyr: lite volym upptill och kortare sidor
    add(sphere(0.06, 0.012, hy + 0.105, 0.035, 1.35, 0.5, 1.0, 16), mats.hair, 'Head');
    for (const s of [1, -1]) add(sphere(0.04, 0.083 * s, hy + 0.035, -0.012, 0.45, 1.0, 1.4, 12), mats.hair, 'Head');
  }
  if (cfg.hairStyle === 'long') {
    // ett sammanhängande hårfall bakom och vid sidorna, ner över axlarna
    const hp = new THREE.SplineCurve(V2([[0.035, 0.13], [0.085, 0.105], [0.104, 0.06], [0.108, 0.0], [0.102, -0.06], [0.1, -0.12], [0.11, -0.18], [0.118, -0.24], [0.112, -0.26]]));
    const fall = new THREE.LatheGeometry(hp.getPoints(30), 40, Math.PI * 0.3, Math.PI * 1.4);
    fall.scale(fem ? 0.98 : 1, 1, 1.12);
    fall.translate(0, hy, -0.004);
    add(fall, mats.hair, (x, y) => (y < hy - 0.1 ? ['Head', 'Chest', THREE.MathUtils.clamp((hy - 0.1 - y) / 0.15, 0, 0.7)] : 'Head'));
  } else if (cfg.hairStyle === 'ponytail') {
    const tail = new THREE.CapsuleGeometry(0.028, 0.17, 4, 10);
    tail.rotateX(0.35);
    tail.translate(0, hy - 0.05, -0.115);
    add(tail, mats.hair, 'Head');
    const band = new THREE.TorusGeometry(0.02, 0.006, 6, 14);
    band.translate(0, hy + 0.04, -0.105);
    add(band, mats.lash, 'Head');
  } else if (cfg.hairStyle === 'bun') {
    add(sphere(0.045, 0, hy + 0.11, -0.075, 1, 0.9, 1, 14), mats.hair, 'Head');
    const band = new THREE.TorusGeometry(0.03, 0.006, 6, 16);
    band.rotateX(0.9);
    band.translate(0, hy + 0.085, -0.07);
    add(band, mats.lash, 'Head');
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
  { name: 'staff-noah', displayName: 'Noah', body: 'm', height: 1.83, skin: '#efc8ad', hair: '#6b4a2f', hairStyle: 'short', eyes: '#4f6b45', lips: '#b97468', top: '#efe8dc', bottom: '#151515', shoes: '#151515', sole: '#151515' },
  { name: 'staff-ella', displayName: 'Ella', body: 'f', height: 1.66, skin: '#6e432c', hair: '#140e0b', hairStyle: 'long', eyes: '#24170f', lips: '#6a3832', top: '#151515', bottom: '#151515', shoes: '#efe8dc' },
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
