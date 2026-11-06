import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import Room, { SPOTS } from './Room.jsx';
import Player from './Player.jsx';
import Controls from './Controls.jsx';
import NavMarker from './NavMarker.jsx';
import Storefront from './Storefront.jsx';
import StoreContent from './StoreContent.jsx';
import { FLOOR_H, LEVELS, STORE } from '../config/storeConfig.js';
import { useStore } from '../state/useStore.js';
import { hideStaffForBake } from './staff/Staff.jsx';

const QUALITY_LEVELS = ['low', 'medium', 'high'];

/**
 * Belysning: hemisfärljus + riktade ljus utan realtidsskuggor, och en
 * environment map som genereras en gång (frames=1) från ljuspaneler i taket.
 * Ljuskäglor och kontaktskuggor "bakas" (renderas en gång) i stället för att
 * räknas om varje bildruta.
 */
function Lighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#bdb6aa', 0.85]} />
      <directionalLight position={[4, 10, 6]} intensity={0.55} color="#fff4e6" />
      <directionalLight position={[-6, 6, -4]} intensity={0.3} color="#f3f1ff" />
      <Environment resolution={128} frames={1} background={false}>
        <color attach="background" args={['#d9d7d2']} />
        {SPOTS.filter((_, i) => i % 3 === 0).map(([x, z], i) => (
          <Lightformer key={i} form="circle" intensity={3} position={[x, STORE.height - 0.1, z]} rotation-x={Math.PI / 2} scale={0.8} />
        ))}
        <Lightformer form="rect" intensity={1.2} position={[0, 2, 9]} scale={[20, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[0, 2, -9]} rotation-y={Math.PI} scale={[20, 3, 1]} />
      </Environment>
    </>
  );
}

/** Mjuka kontaktskuggor under möbler och plagg – renderas om bara när layouten ändras. */
function BakedShadows() {
  const version = useStore((s) => s.layoutVersion);
  // personalen rör sig – den ska inte bakas in som fasta skuggor
  useMemo(() => hideStaffForBake(), [version]);
  return LEVELS.map((l) => l.id * FLOOR_H).map((y) => (
    <ContactShadows
      key={`${version}-${y}`}
      frames={1}
      position={[0, y + 0.003, y ? 0 : 2.4]}
      scale={y ? [26, 15.6] : [26, 20.4]}
      resolution={1024}
      far={0.7}
      blur={2.4}
      opacity={0.75}
      color="#3a342c"
    />
  ));
}

/** Efterbehandling: ambient occlusion, mjuk bloom på lampor, kantutjämning. */
function Effects({ quality }) {
  if (quality === 'low') return null;
  const high = quality === 'high';
  const effects = [
    <N8AO key="ao" halfRes aoRadius={0.7} distanceFalloff={0.6} intensity={high ? 2.4 : 1.8} quality={high ? 'medium' : 'performance'} />,
    high && <Bloom key="bloom" mipmapBlur luminanceThreshold={1} intensity={0.35} radius={0.6} />,
    <ToneMapping key="tm" mode={ToneMappingMode.NEUTRAL} />,
    <Vignette key="vig" offset={0.35} darkness={0.35} />,
    <SMAA key="smaa" />,
  ].filter(Boolean);
  return (
    <EffectComposer key={quality} multisampling={0} disableNormalPass>
      {effects}
    </EffectComposer>
  );
}

/** Byter renderarens tonmappning när kvalitetsnivån ändras. */
function ToneMapSync({ post }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = post ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  }, [gl, post]);
  return null;
}

/** ?quality=high|medium|low låser kvalitetsnivån (ingen automatisk sänkning). */
const LOCKED_QUALITY = new URLSearchParams(window.location.search).get('quality');
if (QUALITY_LEVELS.includes(LOCKED_QUALITY)) useStore.getState().setQuality(LOCKED_QUALITY);

export default function Experience({ children }) {
  const quality = useStore((s) => s.quality);
  // Pausa 3D-renderingen medan AR-provningen är öppen (sparar batteri och GPU).
  const paused = useStore((s) => s.tryOn.open);
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 1.75));
  const post = quality !== 'low';

  useEffect(() => {
    // Exponera för skärmdumps-/felsökningsskript.
    window.__gtQuality = quality;
  }, [quality]);

  const step = (dir) => {
    if (LOCKED_QUALITY) return;
    const s = useStore.getState();
    const i = QUALITY_LEVELS.indexOf(s.quality);
    const n = QUALITY_LEVELS[Math.max(0, Math.min(QUALITY_LEVELS.length - 1, i + dir))];
    if (n !== s.quality) s.setQuality(n);
  };

  return (
    <Canvas
      className="scene-canvas"
      frameloop={paused ? 'never' : 'always'}
      dpr={dpr}
      camera={{ fov: window.innerWidth < 700 ? 74 : 66, near: 0.05, far: 90, position: [0, 1.6, 12] }}
      gl={{
        antialias: !post,
        powerPreference: 'high-performance',
        // Med efterbehandling sköts tonmappningen i ToneMapping-effekten.
        toneMapping: post ? THREE.NoToneMapping : THREE.NeutralToneMapping,
        stencil: false,
      }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#ecebe8');
        if (import.meta.env.DEV) window.__scene = scene;
      }}
    >
      <PerformanceMonitor
        bounds={(refresh) => (refresh > 90 ? [50, 90] : [45, 60])}
        flipflops={3}
        onDecline={() => { step(-1); setDpr((d) => Math.max(1, d - 0.25)); }}
        onIncline={() => setDpr((d) => Math.min(Math.min(window.devicePixelRatio, 1.75), d + 0.25))}
      />
      <ToneMapSync post={post} />
      <Lighting />
      <Suspense fallback={null}>
        <Room />
        <Storefront />
        <StoreContent />
        {children}
        <BakedShadows />
      </Suspense>
      <NavMarker />
      <Player />
      <Controls />
      <Effects quality={quality} />
    </Canvas>
  );
}
