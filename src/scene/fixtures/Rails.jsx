import { MAT } from '../materials.js';

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
