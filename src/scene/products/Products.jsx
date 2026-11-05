import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { useStore } from '../../state/useStore.js';
import { accessoryKind, fabricKind, garmentClass, hangLength, primaryHex } from '../../data/productMeta.js';
import { fabricMaterial, productSwatch } from '../textures.js';
import { requestTexture, useLazyTexture } from '../useLazyTexture.js';
import { productEvents, useIsHighlighted } from './events.js';
import { MAT } from '../materials.js';

/* ------------------------------------------------------------------ hjälp */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function compose(x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Deterministisk pseudo-slump så att butiken ser likadan ut vid varje besök. */
function rng(seed) {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/** Uppdaterar instansfärger när en produkt hovras/väljs. */
function useInstanceHighlight(ref, ids, baseColors) {
  const hovered = useStore((s) => s.hovered?.id);
  const selected = useStore((s) => s.selectedId);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh || !ids.length) return;
    for (let i = 0; i < ids.length; i++) {
      _c.set(baseColors[i]);
      if (ids[i] === hovered || ids[i] === selected) _c.offsetHSL(0, 0.02, 0.09);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceColor.needsUpdate = true;
  }, [hovered, selected, ids, baseColors, ref]);
}

/* ------------------------------------------------------------------ galge */

const hangerGeom = (() => {
  const path = new THREE.CurvePath();
  path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0.03, 0.1, 0), new THREE.Vector3(0.0, 0.11, 0)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0, 0.045, 0)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0.045, 0), new THREE.Vector3(-0.2, -0.01, 0)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(-0.2, -0.01, 0), new THREE.Vector3(0.2, -0.01, 0)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(0.2, -0.01, 0), new THREE.Vector3(0, 0.045, 0)));
  return new THREE.TubeGeometry(path, 40, 0.0035, 5, false);
})();

/* ------------------------------------------------------------------ face-out */

/** Lätt böjt plan så att plagget får volym, som om det hänger över en galge. */
const curvedPlane = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 18, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -(x * x) * 0.3 + Math.sin((y + 0.5) * 9 + x * 3) * 0.006 - (0.5 - y) * 0.03);
  }
  g.computeVertexNormals();
  return g;
})();

function FaceOut({ entry }) {
  const { product: p, slot } = entry;
  // Frilagd tryOnImage ger bäst resultat; annars används första produktbilden.
  const tex = useLazyTexture(p.tryOnImage || p.images[0], slot.pos, 15);
  const hl = useIsHighlighted(p.id);
  const L = hangLength(p);
  const W = L * 0.75;
  const isLower = garmentClass(p) === 'lower' || garmentClass(p) === 'skirt';
  const topOffset = isLower ? 0.03 : 0.08 * L; // halsöppningen sitter en bit ner i bilden
  const ev = useMemo(() => productEvents(p.id), [p.id]);
  const front = useMemo(
    () => new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, color: '#ffffff' }),
    []
  );
  const back = useMemo(
    () => new THREE.MeshStandardMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: '#c9c9c9' }),
    []
  );
  useEffect(() => {
    for (const m of [front, back]) {
      m.map = tex;
      m.needsUpdate = true;
    }
    if (!tex) {
      front.color.set(primaryHex(p));
      back.color.set(primaryHex(p)).multiplyScalar(0.8);
    } else {
      front.color.set('#ffffff');
      back.color.set('#c9c9c9');
    }
  }, [tex, front, back, p]);
  useEffect(() => {
    front.emissive.set(hl ? '#ffffff' : '#000000');
    front.emissiveIntensity = hl ? 0.12 : 0;
  }, [hl, front]);

  const [x, y, z] = slot.pos;
  return (
    <group position={[x, y, z]} rotation-y={slot.rot}>
      <mesh geometry={hangerGeom} material={MAT.black} position={[0, -0.02, 0]} />
      <group position={[0, -L / 2 + topOffset - 0.02, 0]} scale={hl ? 1.025 : 1}>
        <mesh geometry={curvedPlane} material={front} scale={[W, L, W]} userData={{ productId: p.id }} {...ev} />
        <mesh geometry={curvedPlane} material={back} scale={[W, L, W]} position={[0.012, 0.004, -0.045]} raycast={() => null} />
        <mesh geometry={curvedPlane} material={back} scale={[W, L, W]} position={[-0.01, 0.008, -0.09]} raycast={() => null} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ sidohängda */

/**
 * Sidoprofil av ett hängande plagg: sluttande axlar från galgen, raka sidor
 * och en lätt utsvängd fåll. Normaliserad till 1 × 1 × 1 och skalas per instans.
 */
const sideGeom = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.06, 0.5);
  s.quadraticCurveTo(-0.3, 0.47, -0.46, 0.36);
  s.quadraticCurveTo(-0.5, 0.3, -0.49, 0.1);
  s.lineTo(-0.5, -0.46);
  s.quadraticCurveTo(-0.5, -0.5, -0.45, -0.5);
  s.lineTo(0.45, -0.5);
  s.quadraticCurveTo(0.5, -0.5, 0.5, -0.46);
  s.lineTo(0.49, 0.1);
  s.quadraticCurveTo(0.5, 0.3, 0.46, 0.36);
  s.quadraticCurveTo(0.3, 0.47, 0.06, 0.5);
  s.lineTo(-0.06, 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.012, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -0.5);
  g.scale(1, 1, 0.66); // kompenserar för fasningen så att tjockleken blir ~1
  g.rotateY(Math.PI / 2); // profilen ligger i z/y, tjockleken längs x (längs stången)
  g.computeVertexNormals();
  return g;
})();
const hookGeom = new THREE.TorusGeometry(0.018, 0.0028, 5, 12, Math.PI * 1.3);

function SideHung({ entries }) {
  const hooks = useRef();
  const { items } = useMemo(() => {
    const items = [];
    entries.forEach((en, ei) => {
      const { slot, items: prods } = en;
      const r = rng(ei + 1);
      const n = prods.length;
      prods.forEach((p, i) => {
        if (!p) return;
        const t = n > 1 ? i / (n - 1) : 0.5;
        const lx = -slot.length / 2 + t * slot.length + (r() - 0.5) * 0.02;
        const c = Math.cos(slot.rot), s = Math.sin(slot.rot);
        const g = garmentClass(p);
        const L = hangLength(p) * (0.97 + r() * 0.06);
        const depth = { upper: 0.46, outer: 0.54, lower: 0.36, skirt: 0.4, full: 0.44 }[g] ?? 0.45;
        items.push({
          p,
          x: slot.pos[0] + lx * c,
          z: slot.pos[2] - lx * s,
          y: slot.pos[1] - 0.06 - L / 2,
          ry: slot.rot + (r() - 0.5) * 0.12,
          rz: (r() - 0.5) * 0.04,
          L,
          depth,
          thick: g === 'outer' ? 0.048 + r() * 0.012 : 0.026 + r() * 0.014,
          hookY: slot.pos[1] + 0.008,
          color: new THREE.Color(primaryHex(p)).offsetHSL(0, 0, (r() - 0.5) * 0.04).getStyle(),
        });
      });
    });
    return { items };
  }, [entries]);

  useLayoutEffect(() => {
    items.forEach((it, i) => hooks.current.setMatrixAt(i, compose(it.x, it.hookY, it.z, it.ry + Math.PI / 2, 1, 1, 1)));
    hooks.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  const groups = useMemo(() => groupByProduct(items), [items]);
  if (!items.length) return null;
  return (
    <group>
      {Object.entries(groups).map(([id, list]) => (
        <FabricInstances key={id} product={list[0].p} geom={sideGeom} items={list} repeat={fabricKind(list[0].p) === 'denim' ? 34 : 22}
          matrixOf={(it) => compose(it.x, it.y, it.z, it.ry, it.thick, it.L, it.depth, 0, it.rz)} />
      ))}
      <instancedMesh ref={hooks} args={[hookGeom, MAT.chrome, items.length]} raycast={() => null} />
    </group>
  );
}

/** Delar upp plagg per produkt så att varje produkt får sitt eget tyg (en draw call per produkt). */
function groupByProduct(items) {
  const g = {};
  for (const it of items) (g[it.p.id] ??= []).push(it);
  return g;
}

/** Var i produktbilden tyget syns bäst, per plaggtyp. */
const SWATCH_CROP = { upper: [0.38, 0.3, 0.24, 0.22], outer: [0.36, 0.32, 0.28, 0.24], lower: [0.3, 0.3, 0.16, 0.24], skirt: [0.36, 0.2, 0.28, 0.24], full: [0.38, 0.38, 0.24, 0.22] };

/** Instansierade plagg med tygmaterial, per-instansfärg, highlight och klick. */
function FabricInstances({ product, geom, items, matrixOf, repeat }) {
  const ref = useRef();
  const kind = fabricKind(product);
  const ids = useMemo(() => items.map((i) => i.p.id), [items]);
  const [swatchColor, setSwatchColor] = useState(null);
  const colors = useMemo(
    () => items.map((i) => (swatchColor ? new THREE.Color(swatchColor).offsetHSL(0, 0, (Math.random() - 0.5) * 0.03).getStyle() : i.color)),
    [items, swatchColor]
  );
  const mat = useMemo(() => fabricMaterial(kind, repeat), [kind, repeat]);
  // Riktigt tyg från produktbilden (om det finns): mönster som textur och färg som bas.
  useEffect(() => {
    const url = product.tryOnImage || product.images[0];
    if (!url) return;
    let alive = true;
    productSwatch(url, SWATCH_CROP[garmentClass(product)] ?? SWATCH_CROP.upper).then(({ texture, color }) => {
      if (!alive) return;
      const t = texture.clone();
      t.needsUpdate = true;
      t.repeat.set(2, 2);
      mat.map = t;
      mat.needsUpdate = true;
      // Med textur bär kartan färgen – instansfärgen blir en ljus ton för variation.
      setSwatchColor(color ? '#ffffff' : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [product, mat]);
  useLayoutEffect(() => {
    items.forEach((it, i) => {
      ref.current.setMatrixAt(i, matrixOf(it));
      ref.current.setColorAt(i, _c.set(it.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  useInstanceHighlight(ref, ids, colors);
  const ev = useMemo(() => productEvents(null, (e) => ids[e.instanceId]), [ids]);
  return <instancedMesh ref={ref} args={[geom, mat, items.length]} {...ev} />;
}

/* ------------------------------------------------------------------ vikta travar */

const foldGeom = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const topPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** Utsnitt ur tryOn-bilden som visar tygets mönster på den översta vikta delen. */
const CROPS = { upper: [0.34, 0.36, 0.32, 0.26], lower: [0.2, 0.1, 0.24, 0.22] };

function FoldTops({ productId, list }) {
  const ref = useRef();
  const product = useStore((s) => s.productsById[productId]);
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!product?.tryOnImage) return;
    let alive = true;
    requestTexture(product.tryOnImage).then((t) => {
      if (!alive) return;
      const crop = CROPS[garmentClass(product) === 'lower' ? 'lower' : 'upper'];
      const c = t.clone();
      c.needsUpdate = true;
      c.repeat.set(crop[2], crop[3]);
      c.offset.set(crop[0], 1 - crop[1] - crop[3]);
      setTex(c);
    }).catch(() => {});
    return () => { alive = false; };
  }, [product]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    list.forEach((it, i) => ref.current.setMatrixAt(i, compose(it.x, it.y + 0.0015, it.z, it.ry, it.w * 0.94, 1, it.d * 0.94)));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [list, tex]);
  if (!tex) return null;
  return (
    <instancedMesh ref={ref} args={[topPlane, null, list.length]} raycast={() => null}>
      <meshStandardMaterial map={tex} roughness={0.9} transparent alphaTest={0.4} />
    </instancedMesh>
  );
}

function FoldStacks({ entries }) {
  const { pieces, tops } = useMemo(() => {
    const pieces = [];
    const tops = {};
    entries.forEach((en, ei) => {
      const { slot, product: p } = en;
      const r = rng(ei + 11);
      const lower = garmentClass(p) === 'lower';
      const w = lower ? 0.3 : 0.33;
      const d = lower ? 0.34 : 0.27;
      const h = lower ? 0.05 : 0.04;
      const n = Math.min(slot.maxStack ?? 6, 3 + Math.floor(r() * 4));
      const base = new THREE.Color(primaryHex(p));
      let y = slot.pos[1];
      for (let i = 0; i < n; i++) {
        const hh = h * (0.9 + r() * 0.2);
        const ry = slot.rot + (r() - 0.5) * 0.08;
        const ox = (r() - 0.5) * 0.015, oz = (r() - 0.5) * 0.015;
        pieces.push({ p, x: slot.pos[0] + ox, y: y + hh / 2, z: slot.pos[2] + oz, ry, w, h: hh, d, color: base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.03).getStyle() });
        y += hh;
      }
      const top = pieces[pieces.length - 1];
      (tops[p.id] ??= []).push({ x: top.x, y, z: top.z, ry: top.ry, w, d });
    });
    return { pieces, tops };
  }, [entries]);

  const groups = useMemo(() => groupByProduct(pieces), [pieces]);
  if (!pieces.length) return null;
  return (
    <group>
      {Object.entries(groups).map(([id, list]) => (
        <FabricInstances key={id} product={list[0].p} geom={foldGeom} items={list} repeat={fabricKind(list[0].p) === 'denim' ? 16 : 10}
          matrixOf={(it) => compose(it.x, it.y, it.z, it.ry, it.w, it.h, it.d)} />
      ))}
      {Object.entries(tops).map(([id, list]) => (
        <FoldTops key={id} productId={id} list={list} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ accessoarer (3D) */

const shoeGeom = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.12, 0);
  s.lineTo(0.13, 0);
  s.quadraticCurveTo(0.15, 0.0, 0.145, 0.03);
  s.quadraticCurveTo(0.12, 0.06, 0.05, 0.065);
  s.lineTo(-0.06, 0.075);
  s.quadraticCurveTo(-0.12, 0.08, -0.125, 0.045);
  s.lineTo(-0.12, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -0.035);
  g.rotateY(-Math.PI / 2); // tån pekar mot +z
  return g;
})();
const soleGeom = new RoundedBoxGeometry(0.09, 0.014, 0.27, 2, 0.006);
const bagGeom = new RoundedBoxGeometry(0.27, 0.19, 0.09, 3, 0.025);
const flapGeom = new RoundedBoxGeometry(0.272, 0.09, 0.094, 3, 0.02);
const toteGeom = new RoundedBoxGeometry(0.34, 0.3, 0.13, 3, 0.02);
const strapGeom = new THREE.TorusGeometry(0.11, 0.006, 6, 28, Math.PI);
const handleGeom = new THREE.TorusGeometry(0.06, 0.007, 6, 20, Math.PI);
const claspGeom = new THREE.BoxGeometry(0.03, 0.02, 0.008);
const goldMat = new THREE.MeshStandardMaterial({ color: '#c9a35a', metalness: 0.9, roughness: 0.3 });

/** Delar per accessoartyp: [geometri, materialtyp, lokal transform]. */
function partsFor(kind) {
  if (kind === 'shoes') {
    return [
      { geom: shoeGeom, mat: 'base', t: [-0.055, 0.014, 0, 0.06] },
      { geom: shoeGeom, mat: 'base', t: [0.055, 0.014, 0.02, -0.04] },
      { geom: soleGeom, mat: 'sole', t: [-0.055, 0.007, 0, 0.06] },
      { geom: soleGeom, mat: 'sole', t: [0.055, 0.007, 0.02, -0.04] },
    ];
  }
  if (kind === 'tote') {
    return [
      { geom: toteGeom, mat: 'base', t: [0, 0.15, 0, 0] },
      { geom: handleGeom, mat: 'dark', t: [-0.07, 0.3, 0, 0] },
      { geom: handleGeom, mat: 'dark', t: [0.07, 0.3, 0, 0] },
    ];
  }
  return [
    { geom: bagGeom, mat: 'base', t: [0, 0.095, 0, 0] },
    { geom: flapGeom, mat: 'dark', t: [0, 0.15, 0.001, 0] },
    { geom: strapGeom, mat: 'dark', t: [0, 0.19, 0, 0] },
    { geom: claspGeom, mat: 'gold', t: [0, 0.12, 0.05, 0] },
  ];
}

function AccessoryGroup({ productId, list }) {
  const p = useStore((s) => s.productsById[productId]);
  const kind = accessoryKind(p);
  const parts = useMemo(() => partsFor(kind), [kind]);
  const hl = useIsHighlighted(productId);
  const mats = useMemo(() => {
    const base = new THREE.MeshStandardMaterial({ color: primaryHex(p), roughness: 0.45, metalness: 0.05 });
    const dark = base.clone();
    dark.color.multiplyScalar(0.82);
    const sole = new THREE.MeshStandardMaterial({ color: kind === 'shoes' && /sneaker/i.test(p.name) ? '#efefec' : '#1a1a1a', roughness: 0.8 });
    return { base, dark, sole, gold: goldMat };
  }, [p, kind]);
  useEffect(() => {
    for (const k of ['base', 'dark']) {
      mats[k].emissive.set(hl ? '#ffffff' : '#000000');
      mats[k].emissiveIntensity = hl ? 0.1 : 0;
    }
  }, [hl, mats]);
  const refs = useRef([]);
  useLayoutEffect(() => {
    parts.forEach((part, pi) => {
      const mesh = refs.current[pi];
      if (!mesh) return;
      list.forEach((it, i) => {
        const [lx, ly, lz, lry] = part.t;
        const c = Math.cos(it.ry), s = Math.sin(it.ry);
        mesh.setMatrixAt(i, compose(it.x + lx * c + lz * s, it.y + ly, it.z - lx * s + lz * c, it.ry + lry));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [parts, list]);
  const ev = useMemo(() => productEvents(productId), [productId]);
  return (
    <group userData={{ productId }}>
      {parts.map((part, pi) => (
        <instancedMesh
          key={pi}
          ref={(el) => (refs.current[pi] = el)}
          args={[part.geom, mats[part.mat], list.length]}
          userData={{ productId }}
          {...ev}
        />
      ))}
    </group>
  );
}

function Accessories({ entries }) {
  const groups = useMemo(() => {
    const g = {};
    entries.forEach((en, i) => {
      const r = rng(i + 101);
      (g[en.product.id] ??= []).push({ x: en.slot.pos[0], y: en.slot.pos[1], z: en.slot.pos[2], ry: en.slot.rot + (r() - 0.5) * 0.5 });
    });
    return g;
  }, [entries]);
  return Object.entries(groups).map(([id, list]) => <AccessoryGroup key={id} productId={id} list={list} />);
}

/* ------------------------------------------------------------------ export */

export default function Products({ placed }) {
  return (
    <group>
      <FoldStacks entries={placed.folds} />
      <SideHung entries={placed.sides} />
      <Accessories entries={placed.accessories} />
      {placed.faceouts.map((en, i) => (
        <FaceOut key={`${en.fixture.id}-${i}`} entry={en} />
      ))}
    </group>
  );
}
