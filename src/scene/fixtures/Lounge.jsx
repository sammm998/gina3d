/**
 * Gina Lounge (plan 4): catwalk, scen med fond, publikbänkar, bar, soffor och
 * en glasmonter. Mörkare, varm loungekänsla med mässing, sammet och marmor.
 */
import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { MAT } from '../materials.js';
import { marbleTexture, textTexture } from '../textures.js';
import { useLogoTexture } from './Decor.jsx';

const L = {
  runway: new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.22, metalness: 0, envMapIntensity: 0.9 }),
  stageDark: new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.6 }),
  velvet: new THREE.MeshPhysicalMaterial({ color: '#5a2f2a', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#c98b7f'), sheenRoughness: 0.5 }),
  velvetSand: new THREE.MeshPhysicalMaterial({ color: '#c9b49a', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#fff2e0'), sheenRoughness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: '#b8925a', roughness: 0.28, metalness: 1 }),
  walnut: new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.5 }),
  curtain: new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 0.95, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transmission: 0.92, thickness: 0.02, transparent: true, opacity: 0.25, depthWrite: false }),
  ledWarm: new THREE.MeshBasicMaterial({ color: '#ffd9a8', toneMapped: false }),
  rug: new THREE.MeshStandardMaterial({ color: '#2e2622', roughness: 1 }),
  rugLight: new THREE.MeshStandardMaterial({ color: '#cbbba6', roughness: 1 }),
  panel: new THREE.MeshStandardMaterial({ color: '#3b2c24', roughness: 0.55 }),
};

let marble = null;
function marbleMat() {
  if (!marble) marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.18, envMapIntensity: 1 });
  return marble;
}

export function Runway({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={f.h / 2 - 0.01} material={L.stageDark}>
        <boxGeometry args={[f.w, f.h - 0.02, f.d]} />
      </mesh>
      <mesh position-y={f.h - 0.01} material={L.runway}>
        <boxGeometry args={[f.w - 0.02, 0.02, f.d - 0.02]} />
      </mesh>
      {/* LED-list längs kanterna */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (f.w / 2 + 0.003), f.h * 0.35, 0]} material={L.ledWarm}>
          <boxGeometry args={[0.006, 0.012, f.d - 0.04]} />
        </mesh>
      ))}
    </group>
  );
}

export function Stage({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={f.h / 2} material={L.stageDark}>
        <boxGeometry args={[f.w, f.h, f.d]} />
      </mesh>
      <mesh position-y={f.h + 0.006} material={L.runway}>
        <boxGeometry args={[f.w - 0.02, 0.012, f.d - 0.02]} />
      </mesh>
    </group>
  );
}

/** Fond: mörkt draperi med upplyst logotyp och "GINA LOUNGE". */
export function Backdrop({ f }) {
  const dark = useLogoTexture({ height: 256 });
  // ljus logotyp mot det mörka draperiet: behåll formen (alfa), färga varmvit
  const logo = useMemo(() => {
    if (!dark?.image) return null;
    const src = dark.image;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff4e6';
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.aspect = dark.userData.aspect;
    return t;
  }, [dark]);
  const label = useMemo(() => textTexture('LOUNGE', { weight: 300, size: 200, color: '#f3e7d6', letterSpacing: 40 }), []);
  const folds = useMemo(() => {
    const g = new THREE.PlaneGeometry(f.w, f.h, 160, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.05 + Math.sin(p.getX(i) * 23) * 0.015);
    g.computeVertexNormals();
    return g;
  }, [f.w, f.h]);
  const lw = 2.6;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh geometry={folds} material={L.curtain} position={[0, f.h / 2, 0.08]} />
      {logo && (
        <mesh position={[0, 2.35, 0.2]}>
          <planeGeometry args={[lw, lw / (logo.userData.aspect || 4)]} />
          <meshBasicMaterial map={logo} transparent toneMapped={false} color="#ffffff" />
        </mesh>
      )}
      <mesh position={[0, 1.85, 0.2]}>
        <planeGeometry args={[1.4, 1.4 / (label.userData.aspect || 4)]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Bench({ f }) {
  const h = f.high ? 0.62 : 0.45;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {f.high && (
        <mesh position-y={0.08} material={L.stageDark}>
          <boxGeometry args={[f.w, 0.16, f.d + 0.1]} />
        </mesh>
      )}
      <RoundedBox args={[f.w, 0.12, f.d]} radius={0.04} smoothness={3} position-y={h - 0.06} material={L.velvet} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (f.w / 2 - 0.08), (h - 0.12) / 2 + (f.high ? 0.16 : 0), 0]} material={L.brass}>
          <boxGeometry args={[0.03, h - 0.12 - (f.high ? 0.16 : 0), f.d - 0.08]} />
        </mesh>
      ))}
    </group>
  );
}

export function Bar({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {/* räfflad front i valnöt, marmorskiva, mässingsfotlist */}
      <mesh position-y={0.52} material={L.walnut}>
        <boxGeometry args={[f.w, 1.04, f.d - 0.06]} />
      </mesh>
      {Array.from({ length: Math.round(f.w / 0.06) }, (_, i) => (
        <mesh key={i} position={[-f.w / 2 + 0.03 + i * 0.06, 0.52, (f.d - 0.06) / 2 + 0.01]} material={L.walnut}>
          <cylinderGeometry args={[0.022, 0.022, 1.02, 8]} />
        </mesh>
      ))}
      <mesh position-y={1.07} material={marbleMat()}>
        <boxGeometry args={[f.w + 0.08, 0.05, f.d + 0.1]} />
      </mesh>
      <mesh position={[0, 0.12, (f.d - 0.06) / 2 + 0.06]} rotation-z={Math.PI / 2} material={L.brass}>
        <cylinderGeometry args={[0.015, 0.015, f.w - 0.1, 10]} />
      </mesh>
    </group>
  );
}

/** Väggen bakom baren: hyllor med flaskor och glas, varmt bakljus. */
export function BarBack({ f }) {
  const bottles = useMemo(() => {
    const out = [];
    for (const y of [1.25, 1.7]) for (let i = 0; i < 16; i++) out.push([-f.w / 2 + 0.2 + i * ((f.w - 0.4) / 15), y, i % 3]);
    return out;
  }, [f.w]);
  const glassMats = useMemo(() => ['#7a4b2a', '#2f4a3a', '#d8d2c4'].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, transmission: 0.6, thickness: 0.05 })), []);
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position={[0, 1.6, 0.01]} material={marbleMat()}>
        <boxGeometry args={[f.w, 1.6, 0.02]} />
      </mesh>
      {[1.2, 1.65].map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0.14]} material={L.brass}>
            <boxGeometry args={[f.w - 0.1, 0.02, 0.26]} />
          </mesh>
          <mesh position={[0, y - 0.015, 0.26]} material={L.ledWarm}>
            <boxGeometry args={[f.w - 0.14, 0.006, 0.006]} />
          </mesh>
        </group>
      ))}
      {bottles.map(([x, y, k], i) => (
        <mesh key={i} position={[x, y + 0.14, 0.14]} material={glassMats[k]}>
          <cylinderGeometry args={[0.035, 0.038, 0.26, 12]} />
        </mesh>
      ))}
    </group>
  );
}

export function BarStool({ f }) {
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh position-y={0.01} material={L.brass}>
        <cylinderGeometry args={[0.2, 0.22, 0.02, 24]} />
      </mesh>
      <mesh position-y={0.38} material={L.brass}>
        <cylinderGeometry args={[0.02, 0.02, 0.74, 10]} />
      </mesh>
      <RoundedBox args={[0.38, 0.08, 0.38]} radius={0.035} smoothness={3} position-y={0.78} material={L.velvetSand} />
    </group>
  );
}

export function Sofa({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <RoundedBox args={[f.w, 0.42, f.d]} radius={0.12} smoothness={4} position-y={0.24} material={L.velvetSand} />
      <RoundedBox args={[f.w, 0.5, 0.22]} radius={0.1} smoothness={4} position={[0, 0.62, -f.d / 2 + 0.11]} material={L.velvetSand} />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.22, 0.32, f.d]} radius={0.1} smoothness={4} position={[s * (f.w / 2 - 0.11), 0.56, 0]} material={L.velvetSand} />
      ))}
      {[-0.5, 0.5].map((x) => (
        <RoundedBox key={x} args={[f.w / 2 - 0.26, 0.12, f.d - 0.3]} radius={0.05} smoothness={3} position={[x * (f.w / 2 - 0.2), 0.5, 0.08]} material={L.velvetSand} />
      ))}
    </group>
  );
}

export function CoffeeTable({ f }) {
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={0.4} material={marbleMat()} scale={[f.w / 2, 1, f.d / 2]}>
        <cylinderGeometry args={[1, 1, 0.04, 48]} />
      </mesh>
      <mesh position-y={0.19} material={L.brass} scale={[f.w / 3, 1, f.d / 3]}>
        <cylinderGeometry args={[0.6, 1, 0.38, 32, 1, true]} />
      </mesh>
    </group>
  );
}

/** Glasmonter med upplyst sockel (skyltdockorna står i den, se fixtures). */
export function Showcase({ f }) {
  const H = 2.4;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={0.08} material={marbleMat()}>
        <boxGeometry args={[f.w, 0.16, f.d]} />
      </mesh>
      <mesh position-y={0.165} material={L.ledWarm}>
        <boxGeometry args={[f.w - 0.04, 0.008, f.d - 0.04]} />
      </mesh>
      {[[0, f.d / 2, f.w, 0], [0, -f.d / 2, f.w, 0], [f.w / 2, 0, f.d, Math.PI / 2], [-f.w / 2, 0, f.d, Math.PI / 2]].map(([x, z, w, r], i) => (
        <mesh key={i} position={[x, 0.16 + H / 2, z]} rotation-y={r} material={L.glass} raycast={() => null}>
          <planeGeometry args={[w, H]} />
        </mesh>
      ))}
      {/* tunn mässingsram i hörn och överkant */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * f.w / 2, 0.16 + H / 2, sz * f.d / 2]} material={L.brass}>
          <boxGeometry args={[0.015, H, 0.015]} />
        </mesh>
      ))}
    </group>
  );
}

/** Mörk, mjuk matta över loungegolvet (varmare känsla). */
export function LoungeRug({ f }) {
  return (
    <mesh position={[f.x, f.light ? 0.009 : 0.005, f.z]} rotation-x={-Math.PI / 2} material={f.light ? L.rugLight : L.rug} raycast={() => null}>
      <planeGeometry args={[f.w, f.d]} />
    </mesh>
  );
}

/** Lodräta väggpaneler i mörk valnöt med smala mässingsfogar. */
export function WallPanels({ f }) {
  const n = Math.round(f.w / 0.6);
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[-f.w / 2 + 0.3 + i * (f.w / n), 1.75, 0.02]} material={L.panel} raycast={() => null}>
          <boxGeometry args={[f.w / n - 0.012, 3.5, 0.03]} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.04]} material={L.brass} raycast={() => null}>
        <boxGeometry args={[f.w, 0.12, 0.012]} />
      </mesh>
    </group>
  );
}
