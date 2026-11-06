import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { STAFF } from '../../config/staff.js';
import { FLOOR_H } from '../../config/storeConfig.js';
import { zoneById } from '../../config/zones.js';
import { navGrids } from '../../nav/world.js';
import { player } from '../../nav/playerState.js';
import { useStore } from '../../state/useStore.js';

/** Personalens positioner (läses av spelarens kollision och minikartan). */
export const staffState = {};

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
  const nameTex = useNameTexture(cfg.name);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => Object.fromEntries(animations.map((a) => [a.name, mixer.clipAction(a)])), [animations, mixer]);
  const st = useRef(null);

  useEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinnade meshar: bounding sphere följer inte animationen
        o.userData.staffId = cfg.id;
      }
    });
    actions.Idle?.play();
    return () => mixer.stopAllAction();
  }, [model, actions, mixer, cfg.id]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (!navGrids[cfg.level]) return;
    if (!st.current) {
      // startposition: en slumpad fri punkt i första zonen
      const p = randomTarget(cfg, { x: 0, z: 0 });
      const start = p?.at(-1) ?? { x: 0, z: 2 };
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
    if (talking || (sameLevel && dist < 2.6)) {
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
          s.wait = 3 + Math.random() * 5;
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
    group.current.rotation.y = s.yaw;
    staffState[cfg.id] = { x: s.x, z: s.z, level: cfg.level };
    if (label.current) label.current.visible = sameLevel && dist < 9;
  });

  const open = (e) => {
    if (e.delta > 6 || useStore.getState().pointerLocked) return;
    e.stopPropagation();
    useStore.getState().openChat(cfg.id);
  };
  return (
    <group ref={group}>
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
  return STAFF.map((cfg, i) => (
    <Suspense key={cfg.id} fallback={null}>
      <StaffMember cfg={cfg} index={i} />
    </Suspense>
  ));
}
