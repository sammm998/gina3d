import { useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from '../materials.js';

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
export function clothMaterial(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
  }
  return matCache.get(color);
}

const ARM_X = 0.205;
const ARM_TILT = 0.09;

function Body() {
  return (
    <group>
      <mesh geometry={geo.torso} material={MAT.mannequin} scale={[1, 1, 0.72]} />
      <mesh geometry={geo.shoulders} material={MAT.mannequin} position={[0, 1.44, 0]} rotation-z={Math.PI / 2} scale={[1, 1, 0.8]} />
      <mesh geometry={geo.neck} material={MAT.mannequin} position-y={1.55} />
      <mesh geometry={geo.head} material={MAT.mannequin} position-y={1.7} scale={[0.092, 0.118, 0.104]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={geo.arm} material={MAT.mannequin} position={[s * (ARM_X + 0.02), 1.13, 0]} rotation-z={s * ARM_TILT} />
          <mesh geometry={geo.leg} material={MAT.mannequin} position={[s * 0.085, 0.5, 0]} />
          <mesh geometry={geo.foot} material={MAT.mannequin} position={[s * 0.088, 0.05, 0.05]} scale={[0.045, 0.04, 0.11]} />
        </group>
      ))}
    </group>
  );
}

function Garment({ piece, eventsFor }) {
  const m = clothMaterial(piece.color);
  const ev = eventsFor ? eventsFor(piece.productId) : {};
  const ud = { productId: piece.productId };
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
              position={[s * (ARM_X + 0.02 + (long ? 0.025 : 0.01)), long ? 1.13 : 1.34, 0]}
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
