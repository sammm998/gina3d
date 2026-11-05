import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_H, STORE, VOID } from '../config/storeConfig.js';
import { useStore } from '../state/useStore.js';
import { floorTexture, glowTexture, mallFloorTexture } from './textures.js';
import { MAT } from './materials.js';

const { minX, maxX, minZ, maxZ, height: H, door } = STORE;
const W = maxX - minX;
const D = maxZ - minZ;
const TOP = FLOOR_H + H; // övre planets tak
const MALL_H = 8.6; // gallerians takhöjd (två våningar)

const inVoid = (x, z, m = 0.3) => x > VOID.minX - m && x < VOID.maxX + m && z > VOID.minZ - m && z < VOID.maxZ + m;

/** Rutnät av infällda spotlights i taket (delas med ljuskäglorna på golvet). */
export const SPOTS = (() => {
  const pts = [];
  for (let x = minX + 1.5; x <= maxX - 1.4; x += 2.5) {
    for (let z = minZ + 1.25; z <= maxZ - 1.2; z += 2.5) pts.push([x, z]);
  }
  return pts;
})();
const SPOTS_OPEN = SPOTS.filter(([x, z]) => !inVoid(x, z));

/** Fyra rektanglar runt ett hål: [x0, z0, x1, z1]. */
function rectsAround(hole) {
  return [
    [minX, minZ, maxX, hole.minZ],
    [minX, hole.maxZ, maxX, maxZ],
    [minX, hole.minZ, hole.minX, hole.maxZ],
    [hole.maxX, hole.minZ, maxX, hole.maxZ],
  ].filter(([a, b, c, d]) => c - a > 0.01 && d - b > 0.01);
}

/** Horisontell yta med UV i världskoordinater, så att plattorna ligger i linje mellan bitarna. */
function planeGeom([x0, z0, x1, z1], tile, up = true) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
  return g;
}

function useFloorClick(level) {
  const navigateTo = useStore((s) => s.navigateTo);
  return (e) => {
    if (useStore.getState().pointerLocked || useStore.getState().tryOn.open) return;
    if (e.delta > 6) return; // det var ett drag, inte ett klick
    e.stopPropagation();
    navigateTo(e.point.x, e.point.z, null, level);
  };
}

function Floors() {
  const gl = useThree((s) => s.gl);
  const quality = useStore((s) => s.quality);
  const click0 = useFloorClick(0);
  const click1 = useFloorClick(1);
  const tex = useMemo(() => {
    const t = floorTexture(gl.capabilities.getMaxAnisotropy()).clone();
    t.needsUpdate = true;
    return t;
  }, [gl]);
  const mallTex = useMemo(() => {
    const t = mallFloorTexture(gl.capabilities.getMaxAnisotropy()).clone();
    t.needsUpdate = true;
    t.repeat.set(50 / 1.2, 7 / 1.2);
    return t;
  }, [gl]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: tex, color: '#dcdbd7', metalness: 0 }),
    [tex]
  );
  mat.roughness = quality === 'high' ? 0.3 : 0.42;
  mat.envMapIntensity = quality === 'high' ? 0.55 : 0.35;
  const ground = useMemo(() => planeGeom([minX, minZ, maxX, maxZ], 3.2), []);
  const upper = useMemo(() => rectsAround(VOID).map((r) => planeGeom(r, 3.2)), []);
  return (
    <group>
      <mesh geometry={ground} material={mat} onClick={click0} userData={{ walkable: true, level: 0 }} />
      <group position-y={FLOOR_H}>
        {upper.map((g, i) => (
          <mesh key={i} geometry={g} material={mat} onClick={click1} userData={{ walkable: true, level: 1 }} />
        ))}
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, maxZ + 3.5]} onClick={click0} userData={{ walkable: true, level: 0 }}>
        <planeGeometry args={[50, 7]} />
        <meshStandardMaterial map={mallTex} roughness={0.25} envMapIntensity={0.7} />
      </mesh>
    </group>
  );
}

function Spots({ y, points }) {
  const spotRef = useRef();
  const ringRef = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    points.forEach(([x, z], i) => {
      m.makeTranslation(x, y - 0.004, z);
      spotRef.current.setMatrixAt(i, m);
      m.makeTranslation(x, y - 0.002, z);
      ringRef.current.setMatrixAt(i, m);
    });
    spotRef.current.instanceMatrix.needsUpdate = true;
    ringRef.current.instanceMatrix.needsUpdate = true;
  }, [points, y]);
  return (
    <group>
      <instancedMesh ref={ringRef} args={[null, null, points.length]} raycast={() => null}>
        <cylinderGeometry args={[0.11, 0.11, 0.004, 20]} />
        <meshStandardMaterial color="#d8d8d6" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={spotRef} args={[null, null, points.length]} raycast={() => null}>
        <cylinderGeometry args={[0.075, 0.075, 0.006, 20]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Ceilings() {
  const ground = useMemo(() => rectsAround(VOID).map((r) => planeGeom(r, 1, false)), []);
  const top = useMemo(() => planeGeom([minX, minZ, maxX, maxZ], 1, false), []);
  const mat = MAT.ceiling;
  return (
    <group>
      {ground.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} position-y={H} />
      ))}
      <mesh geometry={top} material={mat} position-y={TOP} />
      <Spots y={H} points={SPOTS_OPEN} />
      <Spots y={TOP} points={SPOTS.filter((_, i) => i % 2 === 0)} />
      {/* bjälklagets kanter i schaktet */}
      <group>
        {[
          [(VOID.minX + VOID.maxX) / 2, VOID.minZ, VOID.maxX - VOID.minX, 0],
          [(VOID.minX + VOID.maxX) / 2, VOID.maxZ, VOID.maxX - VOID.minX, Math.PI],
          [VOID.minX, (VOID.minZ + VOID.maxZ) / 2, VOID.maxZ - VOID.minZ, Math.PI / 2],
          [VOID.maxX, (VOID.minZ + VOID.maxZ) / 2, VOID.maxZ - VOID.minZ, -Math.PI / 2],
        ].map(([x, z, w, r], i) => (
          <mesh key={i} position={[x, (H + FLOOR_H) / 2, z]} rotation-y={r} material={MAT.white}>
            <planeGeometry args={[w, FLOOR_H - H]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Svarta takskenor med riktade spotlights (som i butikens referensbilder). */
function TrackLights() {
  const rails = useMemo(
    () => [
      // [x0, z, x1, y]
      [-11.5, -6.2, -1.0, TOP],
      [1.0, -6.2, 8.4, TOP],
      [-11.5, 5.6, 7.5, TOP],
      [-11.5, -1.0, 7.0, TOP],
      [-10.0, -5.6, 6.0, H],
    ],
    []
  );
  const heads = useMemo(() => {
    const out = [];
    rails.forEach(([x0, z, x1, y], ri) => {
      for (let x = x0 + 0.6; x < x1; x += 1.6) out.push({ x, y, z, tilt: ri % 2 ? 0.5 : -0.5 });
    });
    return out;
  }, [rails]);
  const headRef = useRef();
  const lensRef = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    heads.forEach((h, i) => {
      q.setFromEuler(new THREE.Euler(h.tilt, 0, 0));
      m.compose(new THREE.Vector3(h.x, h.y - 0.16, h.z), q, new THREE.Vector3(1, 1, 1));
      headRef.current.setMatrixAt(i, m);
      const lens = new THREE.Vector3(0, -0.09, 0).applyQuaternion(q).add(new THREE.Vector3(h.x, h.y - 0.16, h.z));
      m.compose(lens, q, new THREE.Vector3(1, 1, 1));
      lensRef.current.setMatrixAt(i, m);
    });
    headRef.current.instanceMatrix.needsUpdate = true;
    lensRef.current.instanceMatrix.needsUpdate = true;
  }, [heads]);
  return (
    <group>
      {rails.map(([x0, z, x1, y], i) => (
        <mesh key={i} position={[(x0 + x1) / 2, y - 0.02, z]} material={MAT.black} raycast={() => null}>
          <boxGeometry args={[x1 - x0, 0.035, 0.04]} />
        </mesh>
      ))}
      <instancedMesh ref={headRef} args={[null, MAT.black, heads.length]} raycast={() => null}>
        <cylinderGeometry args={[0.045, 0.055, 0.18, 14]} />
      </instancedMesh>
      <instancedMesh ref={lensRef} args={[null, null, heads.length]} raycast={() => null}>
        <cylinderGeometry args={[0.04, 0.04, 0.005, 14]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** "Bakade" ljuskäglor på golven under spotlights – billigare än riktiga ljus. */
function LightPools() {
  const ref = useRef();
  const tex = glowTexture();
  const pts = useMemo(() => [...SPOTS_OPEN.map(([x, z]) => [x, 0.004, z]), ...SPOTS_OPEN.map(([x, z]) => [x, FLOOR_H + 0.004, z])], []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    pts.forEach(([x, y, z], i) => {
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(2.6, 2.6, 1));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return (
    <instancedMesh ref={ref} args={[null, null, pts.length]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent opacity={0.09} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  );
}

function Walls() {
  const t = STORE.wallThickness;
  const WH = TOP;
  return (
    <group>
      <mesh position={[0, WH / 2, minZ - t / 2]} material={MAT.wall}>
        <boxGeometry args={[W + 2 * t, WH, t]} />
      </mesh>
      <mesh position={[minX - t / 2, WH / 2, (minZ + maxZ) / 2]} material={MAT.wall}>
        <boxGeometry args={[t, WH, D]} />
      </mesh>
      <mesh position={[maxX + t / 2, WH / 2, (minZ + maxZ) / 2]} material={MAT.wall}>
        <boxGeometry args={[t, WH, D]} />
      </mesh>
      {[0, FLOOR_H].map((y) => (
        <group key={y} position-y={y}>
          <mesh position={[0, 0.05, minZ + 0.006]} material={MAT.baseboard}>
            <boxGeometry args={[W, 0.1, 0.012]} />
          </mesh>
          <mesh position={[minX + 0.006, 0.05, (minZ + maxZ) / 2]} material={MAT.baseboard}>
            <boxGeometry args={[0.012, 0.1, D]} />
          </mesh>
          <mesh position={[maxX - 0.006, 0.05, (minZ + maxZ) / 2]} material={MAT.baseboard}>
            <boxGeometry args={[0.012, 0.1, D]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Glaspartier med svarta ramar mellan x-gränserna, från y0 till y1. */
function GlassRow({ ranges, y0, y1 }) {
  const panelW = 2.45;
  const segs = [];
  const mullions = [];
  for (const [a, b] of ranges) {
    const n = Math.max(1, Math.round((b - a) / panelW));
    const w = (b - a) / n;
    for (let i = 0; i < n; i++) segs.push([a + i * w, a + (i + 1) * w]);
    for (let i = 0; i <= n; i++) mullions.push(a + i * w);
  }
  const h = y1 - y0;
  return (
    <group>
      {segs.map(([a, b], i) => (
        <mesh key={i} position={[(a + b) / 2, y0 + h / 2, maxZ]} material={MAT.glass} renderOrder={2}>
          <planeGeometry args={[b - a, h]} />
        </mesh>
      ))}
      {mullions.map((x, i) => (
        <mesh key={i} position={[x, y0 + h / 2, maxZ]} material={MAT.black}>
          <boxGeometry args={[0.07, h, 0.1]} />
        </mesh>
      ))}
      {[y0 + 0.04, y1 - 0.04].map((y) => (
        <mesh key={y} position={[0, y, maxZ]} material={MAT.black}>
          <boxGeometry args={[W, 0.08, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

/** Glasfasad i två våningar: entré med dörr nere, panoramaglas uppe och skyltband emellan. */
function Facade() {
  return (
    <group>
      <GlassRow ranges={[[minX, door.minX], [door.maxX, maxX]]} y0={0} y1={H} />
      <mesh position={[0, H + 0.75, maxZ + 0.02]} material={MAT.facadeBand}>
        <boxGeometry args={[W + 0.4, 1.5, 0.16]} />
      </mesh>
      <GlassRow ranges={[[minX, maxX]]} y0={H + 1.5} y1={TOP} />
    </group>
  );
}

/** Gallerian utanför: grannfasader, tak med ljuslister och en bortre vägg (dubbel takhöjd). */
function Mall() {
  const lights = [];
  for (let x = -20; x <= 20; x += 4) lights.push(x);
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[0, MALL_H, maxZ + 3.5]}>
        <planeGeometry args={[50, 7]} />
        <meshStandardMaterial color="#efeeec" roughness={1} />
      </mesh>
      {lights.map((x) => (
        <mesh key={x} position={[x, MALL_H - 0.02, maxZ + 3.5]}>
          <boxGeometry args={[2.2, 0.02, 0.18]} />
          <meshBasicMaterial color="#fff8ec" toneMapped={false} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 19, MALL_H / 2, maxZ + 0.05]}>
            <boxGeometry args={[12.6, MALL_H, 0.1]} />
            <meshStandardMaterial color="#dcd9d3" roughness={0.9} />
          </mesh>
          <mesh position={[s * 19, 1.6, maxZ + 0.11]}>
            <planeGeometry args={[9, 3.2]} />
            <meshStandardMaterial color="#c9ced1" roughness={0.15} metalness={0.1} transparent opacity={0.55} />
          </mesh>
          <mesh position={[s * 19, 5.9, maxZ + 0.11]}>
            <planeGeometry args={[9, 2.6]} />
            <meshStandardMaterial color="#c9ced1" roughness={0.15} metalness={0.1} transparent opacity={0.55} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, (TOP + MALL_H) / 2, maxZ + 0.05]}>
        <boxGeometry args={[W + 0.4, MALL_H - TOP, 0.1]} />
        <meshStandardMaterial color="#e6e4df" roughness={0.9} />
      </mesh>
      <mesh position={[0, MALL_H / 2, maxZ + 7]}>
        <planeGeometry args={[50, MALL_H]} />
        <meshStandardMaterial color="#e2dfd9" side={THREE.BackSide} roughness={0.95} />
      </mesh>
      {[-14, -5, 5, 14].map((x) => (
        <mesh key={x} position={[x, 1.7, maxZ + 6.98]} rotation-y={Math.PI}>
          <planeGeometry args={[6, 3.4]} />
          <meshStandardMaterial color="#cfd4d6" roughness={0.2} />
        </mesh>
      ))}
      {/* gallerians övre våningsplan på andra sidan */}
      <mesh position={[0, FLOOR_H - 0.25, maxZ + 6.4]}>
        <boxGeometry args={[50, 0.5, 1.2]} />
        <meshStandardMaterial color="#f1f0ed" roughness={0.8} />
      </mesh>
      <mesh position={[0, FLOOR_H + 0.55, maxZ + 5.82]} material={MAT.glass}>
        <planeGeometry args={[50, 1.1]} />
      </mesh>
    </group>
  );
}

export default function Room() {
  return (
    <group>
      <Floors />
      <Ceilings />
      <TrackLights />
      <LightPools />
      <Walls />
      <Facade />
      <Mall />
    </group>
  );
}
