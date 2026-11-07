import * as THREE from 'three';
import { MAT } from '../materials.js';

/** Vita storleksmarkeringar (runda skivor på stången) – som i butik. */
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const sizeMats = {};
function sizeMaterial(label) {
  if (sizeMats[label]) return sizeMats[label];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf9';
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(64, 30, 6, 0, Math.PI * 2); // hål för stången
  g.fill();
  g.font = '600 46px Inter Variable, Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (sizeMats[label] = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
}
const dividerGeom = new THREE.CircleGeometry(0.055, 28);

function SizeDividers({ length, y, z, seed = 0 }) {
  const n = Math.max(2, Math.round(length / 0.45));
  return Array.from({ length: n }, (_, i) => {
    const x = -length / 2 + (length * (i + 0.5)) / n;
    return (
      <mesh key={i} geometry={dividerGeom} material={sizeMaterial(SIZES[(i + seed) % SIZES.length])} position={[x, y - 0.035, z]} rotation-y={Math.PI / 2} raycast={() => null} />
    );
  });
}

const BAR_R = 0.012;

/** Horisontell svart stång längs lokal x-axel. */
function Bar({ length, position }) {
  return (
    <mesh position={position} rotation-z={Math.PI / 2} material={MAT.black}>
      <cylinderGeometry args={[BAR_R, BAR_R, length, 10]} />
    </mesh>
  );
}

/**
 * Väggsektion: två svarta väggskenor, en lång klädstång, face-out-armar i
 * ändarna och en vit hylla ovanför.
 */
export function WallBay({ f }) {
  const half = f.length / 2;
  const faceW = 0.7;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {/* väggskenor */}
      {[-half + 0.03, half - 0.03].map((x) => (
        <mesh key={x} position={[x, 1.2, 0.012]} material={MAT.black}>
          <boxGeometry args={[0.03, 2.4, 0.02]} />
        </mesh>
      ))}
      {/* klädstång för sidohängda plagg (mittdelen) */}
      <Bar length={f.length - faceW * 2 + 0.1} position={[0, f.railY, 0.3]} />
      <SizeDividers length={f.length - faceW * 2} y={f.railY} z={0.3} seed={Math.round(f.x * 3)} />
      {[-half + faceW - 0.05, half - faceW + 0.05].map((x) => (
        <mesh key={x} position={[x, f.railY, 0.16]} rotation-x={Math.PI / 2} material={MAT.black}>
          <cylinderGeometry args={[0.01, 0.01, 0.3, 8]} />
        </mesh>
      ))}
      {/* face-out-armar */}
      {[-half + faceW / 2, half - faceW / 2].map((x) => (
        <mesh key={`a${x}`} position={[x, f.railY - 0.08, 0.2]} rotation-x={Math.PI / 2} material={MAT.black}>
          <cylinderGeometry args={[0.01, 0.01, 0.4, 8]} />
        </mesh>
      ))}
      {/* hylla ovanför */}
      {f.topShelf !== false && (
        <mesh position={[0, f.railY + 0.4, 0.2]} material={MAT.white}>
          <boxGeometry args={[f.length - 0.04, 0.03, 0.4]} />
        </mesh>
      )}
    </group>
  );
}

/** Fristående klädställning i svart metall. */
export function FreeRail({ f }) {
  const half = f.length / 2;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <Bar length={f.length} position={[0, f.railY, 0]} />
      <SizeDividers length={f.length - 0.15} y={f.railY} z={0} seed={Math.round(f.z * 3)} />
      {[-half, half].map((x) => (
        <group key={x} position-x={x}>
          <mesh position-y={f.railY / 2} material={MAT.black}>
            <cylinderGeometry args={[0.013, 0.013, f.railY, 10]} />
          </mesh>
          <mesh position-y={0.015} material={MAT.black}>
            <boxGeometry args={[0.05, 0.03, 0.55]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
