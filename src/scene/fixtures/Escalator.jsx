import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ESCALATORS, FLOOR_H, rampHeight as rampH, voidOf } from '../../config/storeConfig.js';
import { MAT } from '../materials.js';

/**
 * Rulltrappor (upp och ned) mellan entréplan och övre plan.
 * Steg animeras längs banan: nedre platå → 30° lutning → övre platå.
 */
const STEP = 0.4;
/**
 * Stegen ligger en bit OVANFÖR golvet och glider in under kamplattorna i
 * ändarna – annars delar de yta med golvet och flimrar (z-fighting).
 */
const STEP_LIFT = 0.014;
const PLATE_Y = 0.024;

function geometryFor(E) {
  const flatA = E.zBottom - E.zEntry;
  const incl = Math.hypot(E.zTop - E.zBottom, E.rise);
  const flatC = E.zExit - E.zTop;
  const TOTAL = flatA + incl + flatC;
  const LANE_W = E.divider - E.minX - 0.16;
  /** Position (z, y) på banan för sträckan s (0 = nedre änden). */
  const pathAt = (s) => {
    if (s <= flatA) return [E.zEntry + s, 0];
    if (s <= flatA + incl) {
      const t = (s - flatA) / incl;
      return [E.zBottom + t * (E.zTop - E.zBottom), t * E.rise];
    }
    return [E.zTop + (s - flatA - incl), E.rise];
  };
  return { flatA, incl, flatC, TOTAL, LANE_W, pathAt, rampHeight: (z) => rampH(z, E) };
}

const matSteps = new THREE.MeshStandardMaterial({ color: '#7d8084', metalness: 0.85, roughness: 0.38 });
const matStepEdge = new THREE.MeshStandardMaterial({ color: '#d9c86a', metalness: 0.3, roughness: 0.5 });
const matSteel = new THREE.MeshStandardMaterial({ color: '#c9cbcd', metalness: 0.9, roughness: 0.25 });
const matCladding = new THREE.MeshStandardMaterial({ color: '#e8e8e6', metalness: 0.35, roughness: 0.35 });
const matRubber = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.55 });
/** Skimrande glasräcken (som regnbågsglaset i referensbilden). */
const matGlass = new THREE.MeshPhysicalMaterial({
  color: '#e9f1f2', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.32,
  iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900],
  side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6,
});

function Steps({ E, G, lane }) {
  const { TOTAL, LANE_W, pathAt } = G;
  const stepGeom = useMemo(() => new THREE.BoxGeometry(LANE_W, 0.2, STEP * 0.97), [LANE_W]);
  const edgeGeom = useMemo(() => new THREE.BoxGeometry(LANE_W, 0.006, 0.03), [LANE_W]);
  const ref = useRef();
  const edges = useRef();
  const n = Math.ceil(TOTAL / STEP);
  const offset = useRef(0);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    offset.current = (offset.current + lane.dir * E.speed * Math.min(dt, 0.05) + TOTAL) % TOTAL;
    for (let i = 0; i < n; i++) {
      const s = (i * STEP + offset.current) % TOTAL;
      const [z, y] = pathAt(s);
      const hide = s < 0.05 || s > TOTAL - 0.05;
      m.makeTranslation(lane.x, y - 0.1 + STEP_LIFT, z);
      if (hide) m.scale(new THREE.Vector3(0, 0, 0));
      ref.current.setMatrixAt(i, m);
      m.makeTranslation(lane.x, y + STEP_LIFT + 0.003, z + STEP * 0.46);
      if (hide) m.scale(new THREE.Vector3(0, 0, 0));
      edges.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    edges.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[stepGeom, matSteps, n]} frustumCulled={false} raycast={() => null} />
      <instancedMesh ref={edges} args={[edgeGeom, matStepEdge, n]} frustumCulled={false} raycast={() => null} />
    </group>
  );
}

/** Platt figur i z/y-planet som följer banan, mellan höjderna lo och hi över stegen. */
function bandShape(E, z0, z1, lo, hi, loFn = null) {
  const rampHeight = (z) => rampH(z, E);
  const zs = [z0, E.zBottom, E.zTop, z1].filter((z, i, a) => z >= z0 && z <= z1 && (i === 0 || z !== a[i - 1]));
  const s = new THREE.Shape();
  zs.forEach((z, i) => (i ? s.lineTo(z, rampHeight(z) + hi) : s.moveTo(z, rampHeight(z) + hi)));
  [...zs].reverse().forEach((z) => s.lineTo(z, loFn ? loFn(z) : rampHeight(z) + lo));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(-Math.PI / 2); // shape-x -> världens z
  return g;
}

function Balustrade({ E, G, x, outer }) {
  const { rampHeight } = G;
  const z0 = E.zEntry + 0.15, z1 = E.zExit - 0.15;
  const glass = useMemo(() => bandShape(E, z0, z1, 0.14, 0.92), [E]);
  const skirt = useMemo(() => bandShape(E, z0, z1, 0.0, 0.14), [E]);
  // inklädnad under trappan: ner till golvet nertill, ca 1 m tjock i lutningen
  const clad = useMemo(() => bandShape(E, z0 - 0.3, z1 + 0.05, 0, -0.02, (z) => Math.max(0.002, rampHeight(z) - 1.05)), [E]);
  const rail = useMemo(() => {
    const pts = [];
    for (let s = 0; s <= 1.0001; s += 0.02) {
      const z = z0 + s * (z1 - z0);
      pts.push(new THREE.Vector3(0, rampHeight(z) + 0.98, z));
    }
    // mjuka övergångar i knäckpunkterna
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), 160, 0.035, 10, false);
  }, [E]);
  return (
    <group position-x={x}>
      <mesh geometry={glass} material={matGlass} renderOrder={3} />
      <mesh geometry={skirt} material={matSteel} />
      <mesh geometry={rail} material={matRubber} />
      {outer && <mesh geometry={clad} material={matCladding} position-x={outer * 0.02} />}
    </group>
  );
}

/** Undersida av trappan (lutande, plåtklädd). */
function Underside({ E, G }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(E.maxX - E.minX + 0.04, G.incl + 0.2);
    g.rotateX(Math.PI / 2 - Math.atan2(E.rise, E.zTop - E.zBottom));
    return g;
  }, [E, G]);
  const [zc, yc] = [(E.zBottom + E.zTop) / 2, E.rise / 2 - 1.05];
  return <mesh geometry={geom} material={matCladding} position={[(E.minX + E.maxX) / 2, yc + 0.0, zc + 0.0]} side={THREE.DoubleSide} />;
}

function Landings({ E, G }) {
  const LANE_W = G.LANE_W;
  // kamplattor täcker stegens ändar och ligger klart över golvet (inget flimmer)
  const plates = [
    [E.zEntry + 0.35, PLATE_Y],
    [E.zExit - 0.35, FLOOR_H + PLATE_Y],
  ];
  return (
    <group>
      {plates.map(([z, y], i) =>
        E.lanes.map((l) => (
          <mesh key={`${i}${l.id}`} position={[l.x, y, z]} material={matSteel} raycast={() => null}>
            <boxGeometry args={[LANE_W + 0.08, 0.016, 0.72]} />
          </mesh>
        ))
      )}
      {/* gula varningsmarkeringar vid av- och påstigning */}
      {plates.map(([z, y], i) =>
        E.lanes.map((l) => (
          <mesh key={`m${i}${l.id}`} position={[l.x, y + 0.011, z + (i === 0 ? 0.36 : -0.36)]} material={matStepEdge} raycast={() => null}>
            <boxGeometry args={[LANE_W, 0.004, 0.04]} />
          </mesh>
        ))
      )}
    </group>
  );
}

/** Glasräcke runt schaktet på övre plan. */
function VoidRail({ E }) {
  const VOID = voidOf(E);
  const y = FLOOR_H;
  const sides = [
    // [x, z, längd, rotation]
    [VOID.minX - 0.02, (VOID.minZ + VOID.maxZ) / 2 + 0.08, VOID.maxZ - VOID.minZ + 0.16, Math.PI / 2],
    [VOID.maxX + 0.02, (VOID.minZ + VOID.maxZ) / 2 + 0.08, VOID.maxZ - VOID.minZ + 0.16, Math.PI / 2],
    [(VOID.minX + VOID.maxX) / 2, VOID.minZ - 0.02, VOID.maxX - VOID.minX + 0.04, 0],
  ];
  return (
    <group>
      {sides.map(([x, z, len, r], i) => (
        <group key={i} position={[x, y, z]} rotation-y={r}>
          <mesh position-y={0.55} material={matGlass} renderOrder={3}>
            <planeGeometry args={[len, 1.0]} />
          </mesh>
          <mesh position-y={1.07} rotation-z={Math.PI / 2} material={matSteel}>
            <cylinderGeometry args={[0.022, 0.022, len, 10]} />
          </mesh>
          <mesh position-y={0.03} material={matSteel}>
            <boxGeometry args={[len, 0.06, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function EscalatorPair({ E }) {
  const G = useMemo(() => geometryFor(E), [E]);
  return (
    <group position-y={E.fromLevel * FLOOR_H}>
      {E.lanes.map((l) => (
        <Steps key={l.id} E={E} G={G} lane={l} />
      ))}
      <Balustrade E={E} G={G} x={E.minX} outer={-1} />
      <Balustrade E={E} G={G} x={E.divider} />
      <Balustrade E={E} G={G} x={E.maxX} outer={1} />
      <Underside E={E} G={G} />
      <Landings E={E} G={G} />
      <VoidRail E={E} />
    </group>
  );
}

/** Alla rulltrappor i butiken (se ESCALATORS i storeConfig.js). */
export default function Escalator() {
  return ESCALATORS.map((E) => <EscalatorPair key={E.id} E={E} />);
}
