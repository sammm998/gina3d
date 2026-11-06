import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { MAT } from '../materials.js';

/** Cylinder med rundad överkant (lathe) – för de krämvita podierna. */
const roundedCylCache = new Map();
export function roundedCylinder(r, h, bevel = 0.035, segments = 48) {
  const key = `${r}:${h}:${bevel}`;
  if (!roundedCylCache.has(key)) {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r - 0.004, 0), new THREE.Vector2(r, 0.01)];
    pts.push(new THREE.Vector2(r, h - bevel));
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
    }
    pts.push(new THREE.Vector2(0, h));
    roundedCylCache.set(key, new THREE.LatheGeometry(pts, segments));
  }
  return roundedCylCache.get(key);
}

/** Runt podium i två nivåer. */
export function Podium({ f }) {
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh geometry={roundedCylinder(f.r1, f.h1)} material={MAT.cream} />
      <mesh geometry={roundedCylinder(f.r2, f.h2, 0.03)} material={MAT.creamLight} />
      {/* svart sockelskugga */}
      <mesh position-y={0.012} geometry={roundedCylinder(f.r1 - 0.03, 0.024, 0.005)} material={MAT.blackMatte} />
    </group>
  );
}

/** Rektangulärt bord med rundade hörn i två nivåer. */
export function Table({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <RoundedBox args={[f.w, f.h1, f.d]} radius={0.06} smoothness={3} position-y={f.h1 / 2} material={MAT.cream} />
      <RoundedBox args={[f.w * 0.62, f.h2 - f.h1 + 0.02, f.d * 0.78]} radius={0.05} smoothness={3} position-y={f.h1 + (f.h2 - f.h1) / 2 - 0.01} material={MAT.creamLight} />
    </group>
  );
}

export function Platform({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <RoundedBox args={[f.w, f.h, f.d]} radius={0.04} smoothness={2} position-y={f.h / 2} material={MAT.cream} />
    </group>
  );
}

export function RoundPlatform({ f }) {
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh geometry={roundedCylinder(f.r, f.h, 0.03)} material={MAT.cream} />
    </group>
  );
}

/** Öppen hyllsektion för vikta jeans. */
export function Shelf({ f }) {
  const t = 0.03;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {/* bakstycke i ljus ek */}
      <mesh position={[0, f.height / 2, 0.012]} material={MAT.oak}>
        <boxGeometry args={[f.length, f.height, 0.02]} />
      </mesh>
      {/* sidor */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (f.length - t)) / 2, f.height / 2, f.depth / 2]} material={MAT.white}>
          <boxGeometry args={[t, f.height, f.depth]} />
        </mesh>
      ))}
      {/* hyllplan */}
      {[...f.levels, f.height - t / 2].map((y, i) => (
        <mesh key={i} position={[0, y, f.depth / 2]} material={MAT.white}>
          <boxGeometry args={[f.length - t, t, f.depth]} />
        </mesh>
      ))}
    </group>
  );
}

export function CashDesk({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <RoundedBox args={[f.w, 1.0, f.d]} radius={0.05} smoothness={3} position-y={0.5} material={MAT.white} />
      <mesh position={[0, 1.015, 0]} material={MAT.black}>
        <boxGeometry args={[f.w + 0.04, 0.03, f.d + 0.04]} />
      </mesh>
      {/* front i krämvitt med räfflor */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-f.w / 2 + 0.12 + i * ((f.w - 0.24) / 13), 0.5, f.d / 2 + 0.012]} material={MAT.cream}>
          <cylinderGeometry args={[0.035, 0.035, 0.92, 10]} />
        </mesh>
      ))}
      {/* kassaskärm */}
      <group position={[0.55, 1.03, -0.1]}>
        <mesh position-y={0.12} material={MAT.black}>
          <cylinderGeometry args={[0.02, 0.03, 0.24, 8]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation-x={-0.25} material={MAT.screenFrame}>
          <boxGeometry args={[0.36, 0.24, 0.02]} />
        </mesh>
      </group>
      {/* påsar på disken */}
      <mesh position={[-0.6, 1.17, -0.05]} material={MAT.white}>
        <boxGeometry args={[0.3, 0.3, 0.1]} />
      </mesh>
    </group>
  );
}

/** Dubbelsidig hyllgondol: vit stomme, ekhyllor, svart sockel. */
export function Gondola({ f }) {
  const t = 0.028;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={0.05} material={MAT.blackMatte}>
        <boxGeometry args={[f.w - 0.04, 0.1, f.d - 0.04]} />
      </mesh>
      {/* mittvägg i ek */}
      <mesh position-y={(f.h - 0.045) / 2} material={MAT.oak}>
        <boxGeometry args={[f.w - t * 2 - 0.004, f.h - 0.045, 0.03]} />
      </mesh>
      {/* sidorna slutar under toppskivan (inga ytor i samma plan – inget flimmer) */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (f.w - t)) / 2, (f.h - 0.045) / 2, 0]} material={MAT.white}>
          <boxGeometry args={[t, f.h - 0.045, f.d - 0.004]} />
        </mesh>
      ))}
      {f.levels.map((y, i) => (
        <mesh key={i} position-y={y} material={i === 0 ? MAT.white : MAT.oak}>
          <boxGeometry args={[f.w - t * 2 - 0.004, 0.025, f.d - 0.006]} />
        </mesh>
      ))}
      <RoundedBox args={[f.w + 0.02, 0.04, f.d + 0.02]} radius={0.012} smoothness={2} position-y={f.h - 0.02} material={MAT.white} />
    </group>
  );
}

/** Svävande väggylor i ek med dolda konsoler. */
export function WallShelves({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {/* ljus panel bakom hyllorna */}
      <mesh position={[0, 1.42, 0.008]} material={MAT.cream}>
        <boxGeometry args={[f.length + 0.2, 1.6, 0.016]} />
      </mesh>
      {f.levels.map((y) => (
        <mesh key={y} position={[0, y, f.depth / 2 + 0.016]} material={MAT.oak}>
          <boxGeometry args={[f.length, 0.04, f.depth]} />
        </mesh>
      ))}
    </group>
  );
}
