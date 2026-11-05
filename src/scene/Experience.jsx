import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import Room, { SPOTS } from './Room.jsx';
import Player from './Player.jsx';
import Controls from './Controls.jsx';
import NavMarker from './NavMarker.jsx';
import { STORE } from '../config/storeConfig.js';

/**
 * Enkel, billig belysning: hemisfärljus + ett riktat ljus utan skuggor, plus en
 * environment map som genereras en gång (frames=1) från ljuspaneler i taket.
 * Ljuskäglor och kontaktskuggor är "bakade" som texturer.
 */
function Lighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bf', 1.15]} />
      <directionalLight position={[4, 10, 6]} intensity={0.6} color="#fff8ef" />
      <directionalLight position={[-6, 6, -4]} intensity={0.3} color="#f3f1ff" />
      <Environment resolution={64} frames={1} background={false}>
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

export default function Experience({ children }) {
  const [dpr, setDpr] = useState(Math.min(window.devicePixelRatio, 1.75));
  return (
    <Canvas
      className="scene-canvas"
      dpr={dpr}
      camera={{ fov: window.innerWidth < 700 ? 74 : 68, near: 0.05, far: 90, position: [0, 1.6, 12] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: false }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#ecebe8');
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(window.devicePixelRatio, 1.75))} />
      <AdaptiveDpr pixelated={false} />
      <Lighting />
      <Suspense fallback={null}>
        <Room />
        {children}
      </Suspense>
      <NavMarker />
      <Player />
      <Controls />
    </Canvas>
  );
}
