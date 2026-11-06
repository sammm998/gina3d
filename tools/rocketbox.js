/**
 * Konverterar realistiska människomodeller från Microsoft Rocketbox
 * (MIT-licens, https://github.com/microsoft/Microsoft-Rocketbox) till .glb
 * för butikspersonalen. Körs i webbläsaren via `npm run staff-models`
 * (scripts/import-staff-models.mjs öppnar tools/rocketbox.html med Playwright).
 *
 * Per modell: FBX-avatar + tre rörelsefångade animationer (gång, vila, prat)
 * → en skinnad mesh med PBR-material och klippen "Walk", "Idle" och "Talk".
 * Gången görs "på stället" (rotens framåtrörelse tas bort) – appen flyttar
 * personen och anpassar stegtakten efter hastigheten.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const manager = new THREE.LoadingManager();
manager.addHandler(/\.tga$/i, new TGALoader(manager));
// FBX-filerna pekar på texturer bredvid sig själva; de ligger i ../Textures.
manager.setURLModifier((url) => url.replace(/\/Export\/([^/]+\.tga)$/i, '/Textures/$1'));
const loader = new FBXLoader(manager);
const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

/** Ritar om en textur till en canvas i given storlek (och valfritt utan alfa). */
function resample(tex, size, { alpha = false } = {}) {
  const img = tex.image;
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sg = src.getContext('2d');
  if (img.data) {
    // DataTexture (TGA) → ImageData
    const d = new ImageData(new Uint8ClampedArray(img.data.buffer.slice(0)), img.width, img.height);
    sg.putImageData(d, 0, 0);
  } else {
    sg.drawImage(img, 0, 0);
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!alpha) {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, size, size);
  }
  // DataTexture med flipY = false har rad 0 längst ner (v = 0) → vänd till vanlig bildorientering
  if (img.data && !tex.flipY) {
    g.translate(0, size);
    g.scale(1, -1);
  }
  g.drawImage(src, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c); // flipY = true, samma UV-konvention som FBX-geometrin
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
  return t;
}

function convertMaterial(m, opts) {
  const isHair = /opacity/i.test(m.name);
  const isHead = /head/i.test(m.name);
  const map = m.map ? resample(m.map, isHair ? 512 : opts.colorSize, { alpha: isHair }) : null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  const out = new THREE.MeshStandardMaterial({
    name: m.name,
    map,
    normalMap: m.normalMap && !isHair ? resample(m.normalMap, opts.normalSize) : null,
    roughness: isHair ? 0.6 : isHead ? 0.55 : 0.82,
    metalness: 0,
    side: isHair ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (out.normalMap) out.normalMap.colorSpace = THREE.NoColorSpace;
  if (isHair) {
    out.alphaTest = 0.45;
    out.transparent = false;
  }
  return out;
}

const BODY_BONE = /^Bip01(_Pelvis|_Spine\d?|_Neck|_Head|_[LR]_(Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot|Toe0|Finger[0-4]))?$/;

/** Tar bort framåtrörelsen ur roten och onödiga spår. Returnerar klippets hastighet (m/s). */
function prepareClip(clip, name, boneNames, inPlace) {
  let speed = 0;
  clip.tracks = clip.tracks.filter((t) => {
    const bone = t.name.split('.')[0];
    if (!boneNames.has(bone)) return false;
    // ansiktsben och fingerleder rör sig knappt i dessa klipp – hoppa över dem (mindre fil)
    if (!BODY_BONE.test(bone)) return false;
    if (t.name.endsWith('.scale')) return false;
    // bara roten och bäckenet behöver positionsspår (övriga ben har fasta längder)
    if (t.name.endsWith('.position') && bone !== 'Bip01' && bone !== 'Bip01_Pelvis') return false;
    return true;
  });
  const root = clip.tracks.find((t) => t.name === 'Bip01.position');
  if (root && inPlace) {
    const v = root.values;
    const n = v.length / 3;
    const dx = v[(n - 1) * 3] - v[0];
    const dz = v[(n - 1) * 3 + 2] - v[2];
    speed = Math.hypot(dx, dz) / 100 / (root.times[n - 1] - root.times[0]);
    for (let i = 0; i < n; i++) {
      v[i * 3] = v[0];
      v[i * 3 + 2] = v[2];
    }
  }
  if (!inPlace) {
    // vila/prat: 15 bilder/s räcker (interpoleras mjukt) – halverar filstorleken
    clip.tracks = clip.tracks.map((t) => {
      const n = t.times.length, size = t.getValueSize();
      const keep = [];
      for (let i = 0; i < n; i += 2) keep.push(i);
      if (keep.at(-1) !== n - 1) keep.push(n - 1);
      const times = new Float32Array(keep.map((i) => t.times[i]));
      const values = new Float32Array(keep.length * size);
      keep.forEach((i, k) => values.set(t.values.subarray(i * size, i * size + size), k * size));
      return new t.constructor(t.name, times, values);
    });
  }
  clip.name = name;
  clip.optimize();
  clip.resetDuration();
  return speed;
}

async function buildOne(spec, opts) {
  const avatar = await load(spec.avatar);
  // texturerna (TGA) laddas asynkront efter att FBX-filen är klar
  const texs = [];
  avatar.traverse((o) => o.isMesh && [o.material].flat().forEach((m) => ['map', 'normalMap'].forEach((k) => m[k] && texs.push(m[k]))));
  for (let i = 0; i < 600 && texs.some((t) => !t.image || !(t.image.data || t.image.complete) || !(t.image.width > 1)); i++) await new Promise((r) => setTimeout(r, 100));
  const boneNames = new Set();
  avatar.traverse((o) => o.isBone && boneNames.add(o.name));
  // ljus och annat som följer med FBX-filen
  for (const c of [...avatar.children]) if (c.isLight || c.isCamera) avatar.remove(c);
  avatar.traverse((o) => {
    if (o.isMesh) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => convertMaterial(m, opts)) : convertMaterial(o.material, opts);
      o.castShadow = false;
      // FBX-normaler är ibland ojämna mellan delar → räkna om bara om de saknas
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      // tangenter behövs inte i glb (räknas i shadern)
      o.geometry.deleteAttribute('color');
      for (const k of Object.keys(o.geometry.attributes)) if (/^uv[1-9]/.test(k)) o.geometry.deleteAttribute(k);
    }
  });
  const clips = [];
  let walkSpeed = 0;
  for (const [name, url, inPlace] of [['Walk', spec.walk, true], ['Idle', spec.idle, false], ['Talk', spec.talk, false]]) {
    const g = await load(url);
    const clip = g.animations[0].clone();
    const s = prepareClip(clip, name, boneNames, inPlace);
    if (name === 'Walk') walkSpeed = s;
    clips.push(clip);
  }
  const root = new THREE.Group();
  root.name = spec.name;
  avatar.scale.setScalar(0.01); // cm → m
  root.add(avatar);
  root.userData.walkSpeed = Math.round(walkSpeed * 1000) / 1000;
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: spec.name, base64: btoa(bin), size: bytes.length, walkSpeed: root.userData.walkSpeed };
}

window.__convert = async (specs, opts = { colorSize: 1024, normalSize: 512 }) => {
  const out = [];
  for (const s of specs) out.push(await buildOne(s, opts));
  return out;
};
window.__ready = true;
