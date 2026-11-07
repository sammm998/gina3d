import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FIXTURES } from '../../config/fixtures.js';
import { FLOOR_H } from '../../config/storeConfig.js';
import { player } from '../../nav/playerState.js';

/**
 * Catwalkshow i Gina Lounge: fem modeller går i tur och ordning ut på
 * catwalken, poserar längst fram och går tillbaka. Laddas först när
 * besökaren är på plan 4 (eller åker rulltrappan dit).
 */
const MODELS = [1, 2, 3, 4, 5].map((n) => `/assets/models/model-${n}.glb`);
const SPEED = 1.05; // m/s
const POSE = 3.2; // s längst fram
const GAP = 7.5; // s mellan modellerna

function useRunway() {
  return useMemo(() => {
    const r = FIXTURES.find((f) => f.id === 'l-runway');
    const st = FIXTURES.find((f) => f.id === 'l-stage');
    if (!r) return null;
    const y = 3 * FLOOR_H + r.h;
    return { x: r.x, zBack: st ? st.z - 0.15 : r.z - r.d / 2, zFront: r.z + r.d / 2 - 0.55, y };
  }, []);
}

function RunwayModel({ url, index, path }) {
  const { scene, animations } = useGLTF(url);
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => Object.fromEntries(animations.map((a) => [a.name, mixer.clipAction(a)])), [animations, mixer]);
  const walkSpeed = useMemo(() => {
    let v = 1;
    scene.traverse((o) => { if (o.userData?.walkSpeed) v = o.userData.walkSpeed; });
    return v;
  }, [scene]);
  const g = useRef();
  const cur = useRef('');
  useEffect(() => {
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    if (actions.Walk) actions.Walk.timeScale = SPEED / walkSpeed;
    return () => mixer.stopAllAction();
  }, [model, actions, mixer, walkSpeed]);
  const len = path.zFront - path.zBack;
  const walkT = len / SPEED;
  const cycle = MODELS.length * GAP;
  useFrame(({ clock }, dt) => {
    // tidslinje per modell: ut (walkT) – posera (POSE) – vänd (0.8) – tillbaka (walkT) – vila
    let t = (clock.elapsedTime - index * GAP) % cycle;
    if (t < 0) t += cycle;
    let z, yaw, anim, x = path.x, visible = true;
    if (t < walkT) {
      z = path.zBack + t * SPEED; yaw = 0; anim = 'Walk'; x -= 0.12;
    } else if (t < walkT + POSE) {
      z = path.zFront; yaw = Math.sin((t - walkT) * 0.9) * 0.25; anim = 'Idle'; x -= 0.12;
    } else if (t < walkT + POSE + 0.8) {
      z = path.zFront; yaw = ((t - walkT - POSE) / 0.8) * Math.PI; anim = 'Walk'; x -= 0.12;
    } else if (t < 2 * walkT + POSE + 0.8) {
      z = path.zFront - (t - walkT - POSE - 0.8) * SPEED; yaw = Math.PI; anim = 'Walk'; x += 0.12;
    } else {
      visible = false; z = path.zBack; yaw = 0; anim = 'Idle';
    }
    g.current.visible = visible;
    if (!visible) return;
    if (anim !== cur.current && actions[anim]) {
      actions[cur.current]?.fadeOut(0.35);
      actions[anim].reset().fadeIn(0.35).play();
      cur.current = anim;
    }
    mixer.update(Math.min(dt, 0.05));
    g.current.position.set(x, path.y, z);
    g.current.rotation.y = yaw;
  });
  return (
    <group ref={g} visible={false}>
      <primitive object={model} />
    </group>
  );
}

function RunwayLight({ x, y, z }) {
  const light = useMemo(() => {
    const l = new THREE.SpotLight('#ffe6c8', 14, 6, 0.45, 0.8, 1.6);
    l.position.set(x, y + 3.0, z);
    l.target.position.set(x, y, z);
    return l;
  }, [x, y, z]);
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

export default function RunwayShow() {
  const path = useRunway();
  const [on, setOn] = useState(false);
  useFrame(() => {
    if (!on && (player.level === 3 || (player.mode === 'ramp' && player.level === 2))) setOn(true);
  });
  if (!path || !on) return null;
  return (
    <group>
      {MODELS.map((url, i) => (
        <Suspense key={url} fallback={null}>
          <RunwayModel url={url} index={i} path={path} />
        </Suspense>
      ))}
      {/* varmt scenljus längs catwalken */}
      {[0.15, 0.55, 0.9].map((k) => <RunwayLight key={k} x={path.x} y={path.y} z={path.zBack + (path.zFront - path.zBack) * k} />)}
    </group>
  );
}
