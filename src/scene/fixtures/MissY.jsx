/**
 * Miss Y-avdelningen: rosa tema som på ginatricot.com/se/miss-y – rosa vägg,
 * rosa neonskylt, rund rosa matta, sammetspuffar och ett bord med
 * pastellfärgade underkläder (bralettes och trosor).
 */
import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { STORE } from '../../config/storeConfig.js';
import { glowTexture, textTexture } from '../textures.js';

const M = {
  wall: new THREE.MeshStandardMaterial({ color: '#f6c9d5', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  rug: new THREE.MeshStandardMaterial({ color: '#f3b8c8', roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  velvet: new THREE.MeshPhysicalMaterial({ color: '#e98aa6', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffd3e0'), sheenRoughness: 0.5 }),
  table: new THREE.MeshStandardMaterial({ color: '#fbe3ea', roughness: 0.4 }),
  neon: new THREE.MeshBasicMaterial({ color: '#ff5fa2', toneMapped: false }),
};
const PASTELS = ['#f7c6d4', '#ffffff', '#f2d7c9', '#d9c6f2', '#1c1c1c', '#f9a8c2'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide }));

/** Bralette: två kupor + band. */
const cupGeom = new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const bandGeom = new THREE.BoxGeometry(0.24, 0.012, 0.03);
/** Trosa: liten triangel. */
const briefGeom = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.09, 0.05);
  s.lineTo(0.09, 0.05);
  s.quadraticCurveTo(0.03, -0.02, 0.015, -0.06);
  s.lineTo(-0.015, -0.06);
  s.quadraticCurveTo(-0.03, -0.02, -0.09, 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
})();

export function MissYTheme({ f }) {
  const neon = useMemo(() => textTexture('miss y', { weight: 400, size: 220, color: '#ff2e86', letterSpacing: 10 }), []);
  const glow = glowTexture();
  const z0 = STORE.minZ - f.z; // bakväggen relativt mitten
  const items = useMemo(() => {
    const out = [];
    for (let i = 0; i < 12; i++) out.push({ x: -0.55 + (i % 4) * 0.37, z: -0.25 + Math.floor(i / 4) * 0.25, m: i % PASTELS.length, bra: i % 2 === 0 });
    return out;
  }, []);
  return (
    <group position={[f.x, 0, f.z]}>
      {/* rosa väggar: hela vänstra halvan av bakväggen och hela vänsterväggen */}
      <mesh position={[(STORE.minX + 0) / 2 - f.x, 1.75, z0 + 0.006]} material={M.wall} raycast={() => null}>
        <planeGeometry args={[-STORE.minX, 3.5]} />
      </mesh>
      <mesh position={[STORE.minX - f.x + 0.006, 1.75, (STORE.minZ + STORE.maxZ) / 2 - f.z]} rotation-y={Math.PI / 2} material={M.wall} raycast={() => null}>
        <planeGeometry args={[STORE.depth, 3.5]} />
      </mesh>
      {/* rosa neonskylt med glöd */}
      <mesh position={[0, 3.0, z0 + 0.02]} raycast={() => null}>
        <planeGeometry args={[0.8 * (neon.userData.aspect || 3) + 0.6, 1.1]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} toneMapped={false} color="#ff7fb5" opacity={0.55} />
      </mesh>
      <mesh position={[0, 3.0, z0 + 0.03]} raycast={() => null}>
        <planeGeometry args={[0.8 * (neon.userData.aspect || 3), 0.8]} />
        <meshBasicMaterial map={neon} transparent toneMapped={false} color="#ffffff" />
      </mesh>
      {/* rund rosa matta, puffar och underklädesbord */}
      <mesh position={[0, 0.02, 0.6]} rotation-x={-Math.PI / 2} material={M.rug} raycast={() => null} renderOrder={1}>
        <circleGeometry args={[2.2, 64]} />
      </mesh>
      {[[-1.4, 1.5], [1.4, 1.5]].map(([x, z]) => (
        <mesh key={x} position={[x, 0.22, z]} material={M.velvet}>
          <cylinderGeometry args={[0.34, 0.36, 0.44, 32]} />
        </mesh>
      ))}
      <group position={[0, 0, 0.6]}>
        <RoundedBox args={[1.6, 0.72, 0.8]} radius={0.06} smoothness={3} position-y={0.36} material={M.table} />
        {items.map((it, i) => (
          <group key={i} position={[it.x, 0.725, it.z]} rotation-y={(i % 3 - 1) * 0.15}>
            {it.bra ? (
              <>
                <mesh geometry={cupGeom} material={PASTELS[it.m]} position={[-0.055, 0, 0]} scale={[1, 0.45, 1]} />
                <mesh geometry={cupGeom} material={PASTELS[it.m]} position={[0.055, 0, 0]} scale={[1, 0.45, 1]} />
                <mesh geometry={bandGeom} material={PASTELS[it.m]} position={[0, 0.006, 0.045]} />
              </>
            ) : (
              <mesh geometry={briefGeom} material={PASTELS[it.m]} />
            )}
          </group>
        ))}
      </group>
    </group>
  );
}
