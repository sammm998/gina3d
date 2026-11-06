import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SHOPPERS, STAFF } from '../../config/staff.js';
import { FLOOR_H } from '../../config/storeConfig.js';
import { zoneById } from '../../config/zones.js';
import { navGrids } from '../../nav/world.js';
import { player } from '../../nav/playerState.js';
import { useStore } from '../../state/useStore.js';

/** Personalens positioner (läses av spelarens kollision och minikartan). */
export const staffState = {};

/**
 * Döljer personalen några bildrutor medan kontaktskuggorna på golvet bakas –
 * annars "fastnar" deras skugga som en mörk fläck där de råkade stå.
 */
const root = { current: null, hideFrames: 0 };
if (import.meta.env.DEV) window.__staffRoot = root;
export function hideStaffForBake(frames = 12) {
  root.hideFrames = frames;
  if (root.current) root.current.visible = false;
}

const SPEED = 0.85;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function randomTarget(cfg, from) {
  const grid = navGrids[cfg.level];
  if (!grid) return null;
  for (let tries = 0; tries < 25; tries++) {
    const zone = zoneById(cfg.zones[Math.floor(Math.random() * cfg.zones.length)]);
    if (!zone) continue;
    const [x0, z0, x1, z1] = zone.rect;
    const x = x0 + 1 + Math.random() * (x1 - x0 - 2);
    const z = Math.max(z0, -7) + 0.8 + Math.random() * (Math.min(z1, 7) - Math.max(z0, -7) - 1.6);
    const c = grid.toCell(x, z);
    if (!grid.free(c.c, c.r)) continue;
    const path = grid.findPath(from, { x, z });
    if (path && path.length) return path;
  }
  return null;
}

/** Namnskylt ovanför huvudet. */
function useNameTexture(name) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.roundRect(8, 8, 240, 48, 24);
    g.fill();
    g.fillStyle = '#111';
    g.font = '500 24px Inter Variable, Inter, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${name} · Fråga mig`, 128, 33);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [name]);
}

function StaffMember({ cfg, index }) {
  const { scene, animations } = useGLTF(cfg.model);
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const group = useRef();
  const label = useRef();
  const nameTex = useNameTexture(cfg.name ?? '');
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => Object.fromEntries(animations.map((a) => [a.name, mixer.clipAction(a)])), [animations, mixer]);
  // gångklippets egen hastighet (m/s, sparad i modellen) → stegtakt som matchar förflyttningen
  const walkSpeed = useMemo(() => {
    let v = 0;
    scene.traverse((o) => { if (o.userData?.walkSpeed) v = o.userData.walkSpeed; });
    return v;
  }, [scene]);
  const st = useRef(null);

  useEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinnade meshar: bounding sphere följer inte animationen
        o.userData.staffId = cfg.id;
      }
    });
    if (actions.Walk && walkSpeed) actions.Walk.timeScale = SPEED / walkSpeed;
    // olika fas i viloklippet så att personalen inte rör sig i takt
    actions.Idle?.play();
    if (actions.Idle) actions.Idle.time = index * 1.7;
    return () => mixer.stopAllAction();
  }, [model, actions, mixer, cfg.id, walkSpeed, index]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (!navGrids[cfg.level]) return;
    if (!st.current) {
      // startposition: fast plats (kassan) eller en slumpad fri punkt i zonen
      const p = cfg.fixed ? null : randomTarget(cfg, { x: 0, z: 0 });
      const start = cfg.fixed ?? p?.at(-1) ?? { x: 0, z: 2 };
      st.current = { x: start.x, z: start.z, yaw: index, path: null, wait: 1 + index, anim: 'Idle' };
      staffState[cfg.id] = { x: start.x, z: start.z, level: cfg.level };
    }
    const s = st.current;
    const chat = useStore.getState().chat;
    const talking = chat.open && chat.staffId === cfg.id;
    const sameLevel = player.level === cfg.level && player.mode === 'floor';
    const dx = player.x - s.x, dz = player.z - s.z;
    const dist = Math.hypot(dx, dz);
    let anim = 'Idle';
    if (cfg.fixed) {
      // kassapersonalen står kvar bakom disken och tittar mot kunden när hen är nära
      const want = sameLevel && dist < 5 ? Math.atan2(dx, dz) : cfg.fixed.yaw;
      s.yaw += angleDiff(s.yaw, want) * Math.min(1, dt * 3);
      anim = talking ? 'Talk' : 'Idle';
    } else if (cfg.shopper && sameLevel && dist < 1.1) {
      // kunder stannar bara upp om man går rakt mot dem
      anim = 'Idle';
    } else if (!cfg.shopper && (talking || (sameLevel && dist < 2.6))) {
      // stanna och vänd dig mot kunden
      s.yaw += angleDiff(s.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
      anim = talking ? 'Talk' : 'Idle';
      if (talking) s.path = null;
    } else if (s.wait > 0) {
      s.wait -= dt;
    } else if (!s.path) {
      s.path = randomTarget(cfg, { x: s.x, z: s.z });
      if (!s.path) s.wait = 2;
    } else {
      const t = s.path[0];
      const tx = t.x - s.x, tz = t.z - s.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.15) {
        s.path.shift();
        if (!s.path.length) {
          s.path = null;
          s.wait = cfg.shopper ? 6 + Math.random() * 9 : 3 + Math.random() * 5;
        }
      } else {
        s.yaw += angleDiff(s.yaw, Math.atan2(tx, tz)) * Math.min(1, dt * 5);
        s.x += (tx / d) * SPEED * dt;
        s.z += (tz / d) * SPEED * dt;
        anim = 'Walk';
      }
    }
    if (anim !== s.anim && actions[anim]) {
      actions[s.anim]?.fadeOut(0.3);
      actions[anim].reset().fadeIn(0.3).play();
      s.anim = anim;
    }
    mixer.update(dt);
    group.current.position.set(s.x, cfg.level * FLOOR_H, s.z);
    group.current.visible = true; // dold tills första positionen är satt (annars syns hen i origo)
    group.current.rotation.y = s.yaw;
    staffState[cfg.id] = { x: s.x, z: s.z, level: cfg.level };
    if (label.current) label.current.visible = sameLevel && dist < 9;
  });

  if (cfg.shopper) {
    return (
      <group ref={group} visible={false}>
        <primitive object={model} />
      </group>
    );
  }
  const open = (e) => {
    if (e.delta > 6 || useStore.getState().pointerLocked) return;
    e.stopPropagation();
    useStore.getState().openChat(cfg.id);
  };
  return (
    <group ref={group} visible={false}>
      <primitive object={model} />
      {/* osynlig träffyta – lätt att klicka på personen */}
      <mesh position-y={0.9} onClick={open} userData={{ staffId: cfg.id, action: () => useStore.getState().openChat(cfg.id) }}
        onPointerOver={() => document.body.classList.add('is-hovering')} onPointerOut={() => document.body.classList.remove('is-hovering')}>
        <capsuleGeometry args={[0.26, 1.2, 4, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <sprite ref={label} position-y={2.05} scale={[0.72, 0.18, 1]} raycast={() => null}>
        <spriteMaterial map={nameTex} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

export default function Staff() {
  // modellerna (≈ 3 MB st) laddas först när besökaren kommer till våningen – eller åker rulltrappa dit
  const [levels, setLevels] = useState(() => new Set([0]));
  useFrame(() => {
    const want = [player.level];
    if (player.mode === 'ramp') want.push(player.level + 1, player.level - 1);
    if (want.some((l) => l >= 0 && !levels.has(l))) setLevels(new Set([...levels, ...want.filter((l) => l >= 0)]));
    if (!root.current) return;
    if (root.hideFrames > 0) root.hideFrames--;
    root.current.visible = root.hideFrames === 0;
  });
  return (
    <group ref={(g) => { root.current = g; if (g && root.hideFrames) g.visible = false; }}>
      {[...STAFF, ...SHOPPERS].map((cfg, i) => levels.has(cfg.level) && (
        <Suspense key={cfg.id} fallback={null}>
          <StaffMember cfg={cfg} index={i} />
        </Suspense>
      ))}
    </group>
  );
}
