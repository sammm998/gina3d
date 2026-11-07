import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { others } from '../../net/multiplayer.js';
import { player } from '../../nav/playerState.js';
import { useStore } from '../../state/useStore.js';

const AVATARS = [1, 2, 3, 4].map((n) => `/assets/models/shopper-${n}.glb`);

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(17,17,17,0.82)';
  g.beginPath();
  g.roundRect(28, 12, 200, 40, 20);
  g.fill();
  g.fillStyle = '#4ade80';
  g.beginPath();
  g.arc(54, 32, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '500 20px Inter Variable, Inter, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('Besökare', 70, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const LABEL = labelTexture();

function Visitor({ id }) {
  const o = others.get(id);
  const { scene, animations } = useGLTF(AVATARS[(o?.av ?? 0) % AVATARS.length]);
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => Object.fromEntries(animations.map((a) => [a.name, mixer.clipAction(a)])), [animations, mixer]);
  const g = useRef();
  const cur = useRef('');
  useEffect(() => {
    model.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    return () => mixer.stopAllAction();
  }, [model, mixer]);
  useFrame((_, dt) => {
    const p = others.get(id);
    if (!p || !g.current) return;
    const k = Math.min(1, dt * 8);
    p.x += (p.tx - p.x) * k;
    p.z += (p.tz - p.z) * k;
    p.y += ((p.ty ?? 0) - (p.y ?? 0)) * k;
    let d = p.tyaw - (p.yawS ?? p.tyaw);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.yawS = (p.yawS ?? p.tyaw) + d * k;
    // bara synlig på samma våning (eller på väg dit i rulltrappan)
    g.current.visible = Math.abs((p.y ?? 0) - (player.y ?? 0)) < 3;
    g.current.position.set(p.x, p.y ?? 0, p.z);
    g.current.rotation.y = p.yawS + Math.PI; // kameran tittar mot −z, modellen mot +z
    const anim = p.moving ? 'Walk' : 'Idle';
    if (anim !== cur.current && actions[anim]) {
      actions[cur.current]?.fadeOut(0.25);
      actions[anim].reset().fadeIn(0.25).play();
      cur.current = anim;
    }
    mixer.update(Math.min(dt, 0.05));
  });
  return (
    <group ref={g}>
      <primitive object={model} />
      <sprite position-y={2.0} scale={[0.6, 0.15, 1]} raycast={() => null}>
        <spriteMaterial map={LABEL} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Andra besökare som är inne i butiken just nu (live). */
export default function OtherVisitors() {
  useStore((s) => s.othersVersion);
  useStore((s) => s.online);
  return [...others.keys()].map((id) => (
    <Suspense key={id} fallback={null}>
      <Visitor id={id} />
    </Suspense>
  ));
}
