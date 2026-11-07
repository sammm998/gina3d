import { useEffect, useMemo } from 'react';
import { useIsHighlighted } from '../products/events.js';
import * as THREE from 'three';
import { MAT } from '../materials.js';
import { fabricMaterial, productSwatch } from '../textures.js';
import { useStore } from '../../state/useStore.js';
import { useLazyTexture } from '../useLazyTexture.js';
import { DEFAULT_ANCHORS } from '../../tryon/overlay.js';
import { tryOnType } from '../../data/productMeta.js';
import { prepareGarment } from '../../tryon/garmentPrep.js';
import { inflatedGeometry, inflatedMaterials } from '../products/inflate.js';

/**
 * Vit, ansiktslös skyltdocka i low poly, byggd av lathe-geometrier.
 * outfit: [{ type: 'upper'|'outer'|'lower'|'skirt'|'full', color, productId, longSleeve, wide }]
 * eventsFor(productId) ger klick/hover-händelser för ett plagg (steg 3).
 */
const V = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
const TORSO = V([[0.001, 0.9], [0.13, 0.91], [0.158, 0.97], [0.165, 1.03], [0.15, 1.1], [0.125, 1.18], [0.122, 1.23], [0.145, 1.31], [0.152, 1.36], [0.142, 1.42], [0.12, 1.465], [0.07, 1.495], [0.001, 1.5]]);

const geo = {
  torso: new THREE.LatheGeometry(TORSO, 28),
  head: new THREE.SphereGeometry(1, 20, 16),
  neck: new THREE.CylinderGeometry(0.042, 0.048, 0.14, 14),
  shoulders: new THREE.CapsuleGeometry(0.055, 0.26, 4, 12),
  arm: new THREE.CapsuleGeometry(0.032, 0.56, 4, 10),
  leg: new THREE.CylinderGeometry(0.074, 0.04, 0.84, 14),
  foot: new THREE.SphereGeometry(1, 12, 8),
  // kläder
  top: new THREE.LatheGeometry(V([[0.14, 0.97], [0.172, 1.0], [0.17, 1.05], [0.158, 1.12], [0.136, 1.19], [0.134, 1.23], [0.157, 1.31], [0.164, 1.36], [0.154, 1.42], [0.13, 1.47], [0.075, 1.5], [0.05, 1.505]]), 28),
  coat: new THREE.LatheGeometry(V([[0.22, 0.6], [0.205, 0.8], [0.19, 0.97], [0.183, 1.05], [0.17, 1.14], [0.158, 1.22], [0.168, 1.31], [0.176, 1.37], [0.168, 1.43], [0.145, 1.48], [0.085, 1.515], [0.055, 1.52]]), 28),
  hips: new THREE.LatheGeometry(V([[0.172, 0.8], [0.172, 0.9], [0.172, 0.97], [0.168, 1.03], [0.156, 1.08]]), 28, 0, Math.PI * 2),
  skirt: new THREE.LatheGeometry(V([[0.3, 0.55], [0.24, 0.75], [0.185, 0.95], [0.165, 1.03], [0.155, 1.08]]), 32),
  dress: new THREE.LatheGeometry(V([[0.31, 0.58], [0.25, 0.8], [0.19, 1.0], [0.168, 1.07], [0.14, 1.17], [0.135, 1.22], [0.158, 1.31], [0.162, 1.37], [0.15, 1.43]]), 32),
  sleeveShort: new THREE.CylinderGeometry(0.048, 0.045, 0.2, 12, 1, true),
  sleeveLong: new THREE.CylinderGeometry(0.05, 0.043, 0.56, 12, 1, true),
  pantLeg: new THREE.CylinderGeometry(0.086, 0.06, 0.82, 14, 1, true),
  pantLegWide: new THREE.CylinderGeometry(0.09, 0.105, 0.82, 14, 1, true),
};

const matCache = new Map();
export function clothMaterial(color, fabric = 'woven') {
  const key = `${color}:${fabric}`;
  if (!matCache.has(key)) {
    matCache.set(key, fabricMaterial(fabric, fabric === 'denim' ? 18 : 12, { color, side: THREE.DoubleSide }));
  }
  return matCache.get(key);
}

const ARM_X = 0.205;
const ARM_TILT = 0.09;

/**
 * Dockans mått (lokalt, framsida mot +z) som plagget passas mot:
 * axelleder, höftleder och knän – samma punkter som AR-provningen använder.
 */
const BODY = {
  upper: { top: 1.44, half: 0.195, bottom: 0.93, depth: 0.15 },
  outer: { top: 1.45, half: 0.2, bottom: 0.93, depth: 0.17 },
  lower: { top: 0.96, half: 0.088, bottom: 0.5, depth: 0.135 },
  skirt: { top: 0.98, half: 0.088, bottom: 0.5, depth: 0.16 },
  full: { top: 1.44, half: 0.19, bottom: 0.5, depth: 0.165 },
};

/**
 * Det riktiga plagget på dockan: produktfotot projiceras framifrån på ett
 * tygskal som följer dockans kropp. Färg, mönster och detaljer kommer från
 * fotot, formen från kroppen – inga utstickande platta bilder.
 */
function projectedGeometry(base, offset, scale, A, B) {
  const g = base.clone();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const ay = (A.left[1] + A.right[1]) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * scale[0] + offset[0];
    const y = p.getY(i) * scale[1] + offset[1];
    const u = A.left[0] + ((x + B.half) / (2 * B.half)) * (A.right[0] - A.left[0]);
    const v = ay + ((B.top - y) / (B.top - B.bottom)) * (A.bottomY - ay);
    uv[i * 2] = u;
    uv[i * 2 + 1] = 1 - v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Det riktiga plagget på dockan: den frilagda produktbilden (rensad, galgen
 * borttagen) blir ett "uppblåst" 3D-plagg i rätt storlek, placerat på dockans
 * axlar resp. höfter – samma plagg som visas när man klickar på det.
 */
const WORN = {
  upper: { width: 0.37, y: 1.43, z: 0.035, depth: 0.1 },
  outer: { width: 0.41, y: 1.445, z: 0.05, depth: 0.12 },
  full: { width: 0.37, y: 1.43, z: 0.035, depth: 0.1 },
  lower: { width: 0.19, y: 0.9, z: 0.03, depth: 0.09 },
  skirt: { width: 0.19, y: 0.9, z: 0.035, depth: 0.1 },
};
function WornGarment({ piece, product, ev }) {
  const tex = useLazyTexture(product.tryOnImage, [0, 1, 0], 1e6);
  const hl = useIsHighlighted(product.id);
  const kind = piece.type === 'skirt' ? 'lower' : piece.type === 'outer' ? 'upper' : piece.type;
  const prep = useMemo(() => {
    if (!tex?.image) return null;
    const pr = prepareGarment(tex.image, kind === 'full' ? 'full' : kind);
    if (!pr.ok) return null;
    pr.canvas.src ??= `${product.tryOnImage}#worn-${kind}`; // nyckel för geometricachen
    return pr;
  }, [tex, kind, product.tryOnImage]);
  const geom = useMemo(() => (prep ? inflatedGeometry(prep.canvas, { cols: 44, back: 0.9 }) : null), [prep]);
  const mats = useMemo(() => {
    if (!prep) return null;
    const t = new THREE.CanvasTexture(prep.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return inflatedMaterials(t);
  }, [prep]);
  useEffect(() => {
    if (!mats) return;
    mats[0].emissive.set(hl ? '#ffffff' : '#000000');
    mats[0].emissiveIntensity = hl ? 0.12 : 0;
  }, [hl, mats]);
  if (!prep || !geom || !mats) return null;
  const W = WORN[piece.type] ?? WORN.upper;
  const { canvas: c, anchors: A } = prep;
  const pxW = Math.max(1, (A.right[0] - A.left[0]) * c.width);
  const H = (W.width / pxW) * c.height; // höjd i meter för hela bilden
  const cx = ((A.left[0] + A.right[0]) / 2 - 0.5) * (c.width / c.height) * H;
  const y = W.y - (0.5 - A.left[1]) * H;
  return (
    <mesh geometry={geom} material={mats} position={[-cx, y, W.z]} scale={[H, H, W.depth]} {...ev} userData={{ productId: product.id }} />
  );
}

function ProjectedGarment({ piece, product, ev, sleeveMat }) {
  const tex = useLazyTexture(product.tryOnImage, [0, 1, 0], 1e6);
  const hl = useIsHighlighted(product.id);
  const B = BODY[piece.type] ?? BODY.upper;
  const t = tryOnType(product) || 'upper';
  const A = product.tryOnAnchors || DEFAULT_ANCHORS[t];
  const mat = useMemo(() => {
    if (!tex) return null;
    const tx = tex.clone();
    tx.needsUpdate = true;
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshStandardMaterial({ map: tx, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85 });
  }, [tex]);
  useEffect(() => {
    if (!mat) return;
    mat.emissive.set(hl ? '#ffffff' : '#000000');
    mat.emissiveIntensity = hl ? 0.12 : 0;
  }, [hl, mat]);
  const parts = useMemo(() => {
    const z = (sx) => [1, 1, sx];
    switch (piece.type) {
      case 'upper': return [{ g: geo.top, o: [0, 0, 0], s: z(0.76) }];
      case 'outer': return [{ g: geo.coat, o: [0, 0, 0], s: z(0.76) }];
      case 'skirt': return [{ g: geo.skirt, o: [0, 0, 0], s: z(0.8) }];
      case 'full': return [{ g: geo.dress, o: [0, 0, 0], s: z(0.78) }];
      case 'lower':
        return [
          { g: geo.hips, o: [0, 0, 0], s: z(0.74) },
          { g: piece.wide ? geo.pantLegWide : geo.pantLeg, o: [-0.088, 0.5, 0], s: [1, 1, 1] },
          { g: piece.wide ? geo.pantLegWide : geo.pantLeg, o: [0.088, 0.5, 0], s: [1, 1, 1] },
        ];
      default: return [];
    }
  }, [piece.type, piece.wide]);
  const geoms = useMemo(() => parts.map((pt) => projectedGeometry(pt.g, pt.o, pt.s, A, B)), [parts, A, B]);
  if (!mat) return null;
  const sleeves = piece.type === 'upper' || piece.type === 'outer';
  const long = piece.type === 'outer' || piece.longSleeve;
  return (
    <group {...ev} userData={{ productId: product.id }}>
      {parts.map((pt, i) => (
        <mesh key={i} geometry={geoms[i]} material={mat} position={pt.o} scale={pt.s} userData={{ productId: product.id }} />
      ))}
      {sleeves && [-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={long ? geo.sleeveLong : geo.sleeveShort}
          material={sleeveMat}
          position={[s * (ARM_X + 0.02 + (long ? 0.004 : 0.008)), long ? 1.13 : 1.34, 0]}
          rotation-z={s * ARM_TILT}
          userData={{ productId: product.id }}
        />
      ))}
    </group>
  );
}

function Body({ hideArms = false }) {
  return (
    <group>
      <mesh geometry={geo.torso} material={MAT.mannequin} scale={[1, 1, 0.72]} />
      <mesh geometry={geo.shoulders} material={MAT.mannequin} position={[0, 1.44, 0]} rotation-z={Math.PI / 2} scale={[1, 1, 0.8]} />
      <mesh geometry={geo.neck} material={MAT.mannequin} position-y={1.55} />
      <mesh geometry={geo.head} material={MAT.mannequin} position-y={1.7} scale={[0.092, 0.118, 0.104]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          {!hideArms && <mesh geometry={geo.arm} material={MAT.mannequin} position={[s * (ARM_X + 0.02), 1.13, 0]} rotation-z={s * ARM_TILT} />}
          <mesh geometry={geo.leg} material={MAT.mannequin} position={[s * 0.085, 0.5, 0]} />
          <mesh geometry={geo.foot} material={MAT.mannequin} position={[s * 0.088, 0.05, 0.05]} scale={[0.045, 0.04, 0.11]} />
        </group>
      ))}
    </group>
  );
}

function Garment({ piece, eventsFor }) {
  const m = useMemo(() => clothMaterial(piece.color, piece.fabric).clone(), [piece.color, piece.fabric]);
  const hl = useIsHighlighted(piece.productId);
  const product = useStore((s) => s.productsById[piece.productId]);
  // riktigt tyg: färg och mönster ur produktfotot
  useEffect(() => {
    const url = product?.tryOnImage || product?.images?.[0];
    if (!url) return;
    let alive = true;
    const crop = { upper: [0.38, 0.3, 0.24, 0.22], outer: [0.36, 0.32, 0.28, 0.24], lower: [0.3, 0.3, 0.16, 0.24], skirt: [0.36, 0.2, 0.28, 0.24], full: [0.38, 0.38, 0.24, 0.22] }[piece.type];
    productSwatch(url, crop).then(({ texture }) => {
      if (!alive) return;
      const t = texture.clone();
      t.needsUpdate = true;
      t.repeat.set(3, 3);
      m.map = t;
      m.color.set('#ffffff');
      m.needsUpdate = true;
    }).catch(() => {});
    return () => { alive = false; };
  }, [product, m, piece.type]);
  useEffect(() => {
    m.emissive.set(hl ? '#ffffff' : '#000000');
    m.emissiveIntensity = hl ? 0.12 : 0;
  }, [hl, m]);
  const ev = eventsFor ? eventsFor(piece.productId) : {};
  const ud = { productId: piece.productId };
  if (product?.tryOnImage) return <WornGarment piece={piece} product={product} ev={ev} />;
  switch (piece.type) {
    case 'upper':
    case 'outer': {
      const outer = piece.type === 'outer';
      const long = outer || piece.longSleeve;
      return (
        <group {...ev} userData={ud}>
          <mesh geometry={outer ? geo.coat : geo.top} material={m} scale={[1, 1, 0.76]} userData={ud} />
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              geometry={long ? geo.sleeveLong : geo.sleeveShort}
              material={m}
              position={[s * (ARM_X + 0.02 + (long ? 0.004 : 0.008)), long ? 1.13 : 1.34, 0]}
              rotation-z={s * ARM_TILT}
              userData={ud}
            />
          ))}
        </group>
      );
    }
    case 'lower':
      return (
        <group {...ev} userData={ud}>
          <mesh geometry={geo.hips} material={m} scale={[1, 1, 0.74]} userData={ud} />
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={piece.wide ? geo.pantLegWide : geo.pantLeg} material={m} position={[s * 0.088, 0.5, 0]} userData={ud} />
          ))}
        </group>
      );
    case 'skirt':
      return <mesh geometry={geo.skirt} material={m} scale={[1, 1, 0.8]} {...ev} userData={ud} />;
    case 'full':
      return <mesh geometry={geo.dress} material={m} scale={[1, 1, 0.78]} {...ev} userData={ud} />;
    default:
      return null;
  }
}

export default function Mannequin({ f, outfit = [], eventsFor }) {
  const order = useMemo(() => {
    // rita "outer" sist så att kappan hamnar utanpå toppen
    const rank = { lower: 0, skirt: 1, full: 1, upper: 2, outer: 3 };
    return [...outfit].sort((a, b) => rank[a.type] - rank[b.type]);
  }, [outfit]);
  return (
    <group position={[f.x, f.y || 0, f.z]} rotation-y={f.rot}>
      <Body />
      {order.map((p, i) => (
        <Garment key={`${p.productId}-${i}`} piece={p} eventsFor={eventsFor} />
      ))}
    </group>
  );
}
