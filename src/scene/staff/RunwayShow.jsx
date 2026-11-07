import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { useStore } from '../../state/useStore.js';
import { formatPrice } from '../../i18n/index.js';
import { garmentClass } from '../../data/productMeta.js';
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
/** Vad modellerna har på sig (model-1 … model-5) – används för att hitta liknande plagg. */
const OUTFITS = [
  [[['upper'], ['tank', 'singlet', 'linne', 'top'], ['white', 'vit', 'offwhite']], [['lower'], ['shorts', 'denim', 'jeans'], ['blue', 'blå']]],
  [[['upper'], ['top', 'vest', 'tank', 'linne'], ['grey', 'grå', 'gray']], [['lower'], ['jeans', 'straight', 'denim'], ['blue', 'blå']]],
  [[['outer'], ['jacket', 'leather', 'jacka'], ['brown', 'brun', 'black', 'svart']], [['lower'], ['trousers', 'cargo', 'byxor'], ['beige', 'khaki', 'green', 'grön']]],
  [[['upper', 'outer'], ['shirt', 'blouse', 'skjorta', 'blus'], ['blue', 'blå']], [['skirt'], ['skirt', 'kjol', 'mini'], ['black', 'svart']]],
  [[['upper', 'outer'], ['hoodie', 'sweat', 'zip', 'jacket'], ['black', 'svart']], [['lower'], ['shorts', 'denim'], ['blue', 'blå']]],
];
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

function RunwayModel({ url, index, path, look }) {
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
  const card = useRef();
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
    // produktkortet syns medan modellen är ute på catwalken
    if (card.current) card.current.style.opacity = visible && t < 2 * walkT + POSE ? '1' : '0';
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
      {look.length > 0 && (
        <Html position={[0, 2.15, 0]} center distanceFactor={4} zIndexRange={[20, 0]}>
          <div ref={card} className="runway-card" style={{ opacity: 0 }}>
            <p className="runway-card__eyebrow">Liknande plagg hos Gina Tricot</p>
            {look.map((p) => (
              <button key={p.id} className="runway-card__item" onClick={() => useStore.getState().select(p.id)}>
                {p.images?.[0] && <img src={p.tryOnImage || p.images[0]} alt="" />}
                <span><strong>{p.name}</strong><span>{formatPrice(p.price, p.currency)}</span></span>
              </button>
            ))}
          </div>
        </Html>
      )}
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
  const products = useStore((s) => s.products);
  // Modellerna bär sina egna 3D-kläder. Kortet visar de Gina Tricot-plagg som
  // liknar mest (plaggtyp, färg och ord i namnet) – och säger det rakt ut.
  const looks = useMemo(() => {
    const g = products.filter((p) => garmentClass(p) !== 'accessory');
    const pick = (cls, words, colors, used) => {
      let best = null, bs = -1;
      for (const p of g) {
        if (!cls.includes(garmentClass(p)) || used.has(p.id)) continue;
        const name = p.name.toLowerCase();
        const cols = (p.colors || []).join(' ').toLowerCase();
        const sc = words.filter((w) => name.includes(w)).length * 3 + colors.filter((c) => cols.includes(c) || name.includes(c)).length * 2 + (p.tryOnImage ? 0.5 : 0);
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best) used.add(best.id);
      return best;
    };
    const used = new Set();
    return OUTFITS.map((o) => o.map(([cls, words, colors]) => pick(cls, words, colors, used)).filter(Boolean));
  }, [products]);
  if (!path || !on) return null;
  return (
    <group>
      {MODELS.map((url, i) => (
        <Suspense key={url} fallback={null}>
          <RunwayModel url={url} index={i} path={path} look={looks[i] ?? []} />
        </Suspense>
      ))}
      {/* varmt scenljus längs catwalken */}
      {[0.15, 0.55, 0.9].map((k) => <RunwayLight key={k} x={path.x} y={path.y} z={path.zBack + (path.zFront - path.zBack) * k} />)}
    </group>
  );
}
