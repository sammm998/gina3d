import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STORE } from '../config/storeConfig.js';
import { useStore } from '../state/useStore.js';
import { floorTexture, glowTexture, mallFloorTexture } from './textures.js';
import { MAT } from './materials.js';

const { minX, maxX, minZ, maxZ, height: H, door } = STORE;
const W = maxX - minX;
const D = maxZ - minZ;

/** Rutnät av infällda spotlights i taket (delas med ljuskäglorna på golvet). */
export const SPOTS = (() => {
  const pts = [];
  for (let x = minX + 1.5; x <= maxX - 1.4; x += 2.5) {
    for (let z = minZ + 1.25; z <= maxZ - 1.2; z += 2.5) pts.push([x, z]);
  }
  return pts;
})();

function useFloorClick() {
  const navigateTo = useStore((s) => s.navigateTo);
  return (e) => {
    if (useStore.getState().pointerLocked || useStore.getState().tryOn.open) return;
    if (e.delta > 6) return; // det var ett drag, inte ett klick
    e.stopPropagation();
    navigateTo(e.point.x, e.point.z);
  };
}

function Floor() {
  const gl = useThree((s) => s.gl);
  const onClick = useFloorClick();
  const tex = useMemo(() => {
    const t = floorTexture(gl.capabilities.getMaxAnisotropy()).clone();
    t.needsUpdate = true;
    t.repeat.set(W / 3.2, D / 3.2);
    return t;
  }, [gl]);
  const mallTex = useMemo(() => {
    const t = mallFloorTexture(gl.capabilities.getMaxAnisotropy()).clone();
    t.needsUpdate = true;
    t.repeat.set(50 / 1.2, 7 / 1.2);
    return t;
  }, [gl]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (minZ + maxZ) / 2]} onClick={onClick} userData={{ walkable: true }}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.42} metalness={0} envMapIntensity={0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, maxZ + 3.5]} onClick={onClick} userData={{ walkable: true }}>
        <planeGeometry args={[50, 7]} />
        <meshStandardMaterial map={mallTex} roughness={0.25} envMapIntensity={0.7} />
      </mesh>
    </group>
  );
}

function Ceiling() {
  const spotRef = useRef();
  const ringRef = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    SPOTS.forEach(([x, z], i) => {
      m.makeTranslation(x, H - 0.004, z);
      spotRef.current.setMatrixAt(i, m);
      m.makeTranslation(x, H - 0.002, z);
      ringRef.current.setMatrixAt(i, m);
    });
    spotRef.current.instanceMatrix.needsUpdate = true;
    ringRef.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[0, H, (minZ + maxZ) / 2]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#fbfbfa" roughness={1} />
      </mesh>
      {/* infällda spotlights: lysande skiva + ljusgrå ring */}
      <instancedMesh ref={ringRef} args={[null, null, SPOTS.length]} rotation-x={0}>
        <cylinderGeometry args={[0.11, 0.11, 0.004, 20]} />
        <meshStandardMaterial color="#d8d8d6" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={spotRef} args={[null, null, SPOTS.length]}>
        <cylinderGeometry args={[0.075, 0.075, 0.006, 20]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** "Bakade" ljuskäglor på golvet under varje spotlight – billigare än riktiga ljus. */
function LightPools() {
  const ref = useRef();
  const tex = glowTexture();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    SPOTS.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x, 0.004, z), q, new THREE.Vector3(2.6, 2.6, 1));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[null, null, SPOTS.length]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent opacity={0.09} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  );
}

function Walls() {
  const t = STORE.wallThickness;
  return (
    <group>
      {/* bakvägg */}
      <mesh position={[0, H / 2, minZ - t / 2]} material={MAT.wall}>
        <boxGeometry args={[W + 2 * t, H, t]} />
      </mesh>
      {/* sidoväggar */}
      <mesh position={[minX - t / 2, H / 2, (minZ + maxZ) / 2]} material={MAT.wall}>
        <boxGeometry args={[t, H, D]} />
      </mesh>
      <mesh position={[maxX + t / 2, H / 2, (minZ + maxZ) / 2]} material={MAT.wall}>
        <boxGeometry args={[t, H, D]} />
      </mesh>
      {/* sockel */}
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
  );
}

/** Glasfasad med svarta ramar och en dörröppning i mitten. */
function Facade() {
  const mullions = [];
  const panelW = 2.45;
  const segs = [];
  // Glas från vänsterväggen till dörren och från dörren till högerväggen.
  for (const [a, b] of [[minX, door.minX], [door.maxX, maxX]]) {
    const n = Math.max(1, Math.round((b - a) / panelW));
    const w = (b - a) / n;
    for (let i = 0; i < n; i++) segs.push([a + i * w, a + (i + 1) * w]);
    for (let i = 0; i <= n; i++) mullions.push(a + i * w);
  }
  const glassH = H;
  return (
    <group>
      {segs.map(([a, b], i) => (
        <mesh key={i} position={[(a + b) / 2, glassH / 2, maxZ]} material={MAT.glass} renderOrder={2}>
          <planeGeometry args={[b - a, glassH]} />
        </mesh>
      ))}
      {mullions.map((x, i) => (
        <mesh key={i} position={[x, glassH / 2, maxZ]} material={MAT.black}>
          <boxGeometry args={[0.07, glassH, 0.1]} />
        </mesh>
      ))}
      {/* nedre och övre ramprofil */}
      <mesh position={[0, 0.04, maxZ]} material={MAT.black}>
        <boxGeometry args={[W, 0.08, 0.12]} />
      </mesh>
      <mesh position={[0, glassH - 0.04, maxZ]} material={MAT.black}>
        <boxGeometry args={[W, 0.08, 0.12]} />
      </mesh>
      {/* fasadband ovanför glaset, där skylten sitter */}
      <mesh position={[0, H + 0.75, maxZ + 0.02]} material={MAT.facadeBand}>
        <boxGeometry args={[W + 0.4, 1.5, 0.16]} />
      </mesh>
    </group>
  );
}

/** Gallerian utanför: grannfasader, tak med ljuslister och en bortre vägg. */
function Mall() {
  const lights = [];
  for (let x = -20; x <= 20; x += 4) lights.push(x);
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[0, 5.2, maxZ + 3.5]}>
        <planeGeometry args={[50, 7]} />
        <meshStandardMaterial color="#efeeec" roughness={1} />
      </mesh>
      {lights.map((x) => (
        <mesh key={x} position={[x, 5.18, maxZ + 3.5]}>
          <boxGeometry args={[2.2, 0.02, 0.18]} />
          <meshBasicMaterial color="#fff8ec" toneMapped={false} />
        </mesh>
      ))}
      {/* grannfasader */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 19, 2.6, maxZ + 0.05]}>
            <boxGeometry args={[12.6, 5.2, 0.1]} />
            <meshStandardMaterial color="#dcd9d3" roughness={0.9} />
          </mesh>
          <mesh position={[s * 19, 1.6, maxZ + 0.11]}>
            <planeGeometry args={[9, 3.2]} />
            <meshStandardMaterial color="#c9ced1" roughness={0.15} metalness={0.1} transparent opacity={0.55} />
          </mesh>
        </group>
      ))}
      {/* fasadens överdel upp till gallerians tak */}
      <mesh position={[0, (H + 1.5 + 5.2) / 2, maxZ + 0.05]}>
        <boxGeometry args={[W + 0.4, 5.2 - H - 1.5, 0.1]} />
        <meshStandardMaterial color="#e6e4df" roughness={0.9} />
      </mesh>
      {/* bortre vägg */}
      <mesh position={[0, 2.6, maxZ + 7]}>
        <planeGeometry args={[50, 5.2]} />
        <meshStandardMaterial color="#e2dfd9" side={THREE.BackSide} roughness={0.95} />
      </mesh>
      {[-14, -5, 5, 14].map((x) => (
        <mesh key={x} position={[x, 1.7, maxZ + 6.98]} rotation-y={Math.PI}>
          <planeGeometry args={[6, 3.4]} />
          <meshStandardMaterial color="#cfd4d6" roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

export default function Room() {
  return (
    <group>
      <Floor />
      <Ceiling />
      <LightPools />
      <Walls />
      <Facade />
      <Mall />
    </group>
  );
}
