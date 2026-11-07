/**
 * Utsidan, inspirerad av Gina Tricots huvudkontor: en hög, ljus volym klädd i
 * frostade glaspaneler i ett tätt rutnät, en svart vertikal slits och den
 * lodräta svarta logotypen. Framför: stenlagt torg, betongbänkar, gatlyktor,
 * björkar och blå himmel.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FLOOR_H, LEVELS, STORE, TOP_Y } from '../config/storeConfig.js';
import { useLogoTexture } from './fixtures/Decor.jsx';

const { minX, maxX, minZ, maxZ } = STORE;
const H = STORE.height;
const ROOF = TOP_Y + 2.2; // fasaden går upp förbi taket (attika)

/** Frostat glas i rutnät (som HK-fasaden): ljusgrå paneler med fogar och svaga fönsterband. */
function panelTexture(cols, rows) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 1024);
  grd.addColorStop(0, '#e9eef1');
  grd.addColorStop(1, '#d9dfe3');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 1024);
  const pw = 1024 / cols, ph = 1024 / rows;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const v = 228 + Math.round((rnd() - 0.5) * 10);
      g.fillStyle = `rgba(${v},${v + 3},${v + 6},0.55)`;
      g.fillRect(i * pw + 1, j * ph + 1, pw - 2, ph - 2);
      // svaga fönster bakom det frostade glaset
      if (j % 3 === 1 && rnd() > 0.25) {
        g.fillStyle = 'rgba(150,160,168,0.22)';
        g.fillRect(i * pw + pw * 0.15, j * ph + ph * 0.25, pw * 0.7, ph * 0.5);
      }
    }
  }
  g.strokeStyle = 'rgba(160,168,174,0.9)';
  g.lineWidth = 2;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * pw, 0); g.lineTo(i * pw, 1024); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * ph); g.lineTo(1024, j * ph); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const cladCache = {};
function cladding(w, h) {
  const key = `${w.toFixed(1)}x${h.toFixed(1)}`;
  if (cladCache[key]) return cladCache[key];
  const t = panelTexture(16, 16);
  t.repeat.set(w / 12, h / 12); // paneler ~0,75 m
  return (cladCache[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.25, envMapIntensity: 1.2 }));
}

/** Himmel: stor sfär med blå gradient (mörkare uppåt, ljus horisont). */
function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = clamp(vP.y, 0.0, 1.0);
      vec3 horizon = vec3(0.80, 0.88, 0.96);
      vec3 zenith = vec3(0.16, 0.42, 0.80);
      vec3 col = mix(horizon, zenith, pow(h, 0.55));
      gl_FragColor = vec4(col, 1.0);
    }`,
  }), []);
  // himlen följer kameran (annars klipps den bort på avstånd)
  const ref = useRef();
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[80, 32, 16]} />
    </mesh>
  );
}

/** Björk: vit stam med svarta fläckar, tunna grenar och en gles, ljusgrön krona. */
const barkTex = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ecebe6';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(30,30,30,${0.4 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 6 + Math.random() * 20, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.8 });
const leafMats = ['#7aa35a', '#8cb466', '#6c9550'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const leafGeom = new THREE.IcosahedronGeometry(0.55, 1);

function Birch({ x, z, h = 7, seed = 1 }) {
  const parts = useMemo(() => {
    let s = seed * 97;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const branches = [];
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const y = h * (0.4 + r() * 0.5);
      const a = r() * Math.PI * 2;
      const len = 1 + r() * 1.6;
      branches.push({ y, a, len, tilt: 0.6 + r() * 0.5 });
      for (let k = 0; k < 4; k++) {
        const t = 0.4 + r() * 0.6;
        leaves.push({ p: [Math.cos(a) * len * t * Math.sin(0.9), y + len * t * 0.7 + (r() - 0.3) * 0.6, Math.sin(a) * len * t * Math.sin(0.9)], s: 0.7 + r() * 0.8, m: Math.floor(r() * 3) });
      }
    }
    return { branches, leaves };
  }, [h, seed]);
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={h / 2} material={barkMat}>
        <cylinderGeometry args={[0.07, 0.13, h, 10]} />
      </mesh>
      {parts.branches.map((b, i) => (
        <mesh key={i} position={[Math.cos(b.a) * b.len * 0.35, b.y + b.len * 0.3, Math.sin(b.a) * b.len * 0.35]} rotation={[Math.sin(b.a) * b.tilt, 0, -Math.cos(b.a) * b.tilt]} material={barkMat}>
          <cylinderGeometry args={[0.015, 0.04, b.len, 6]} />
        </mesh>
      ))}
      {parts.leaves.map((l, i) => (
        <mesh key={`l${i}`} geometry={leafGeom} material={leafMats[l.m]} position={l.p} scale={[l.s, l.s * 0.8, l.s]} />
      ))}
    </group>
  );
}

const concrete = new THREE.MeshStandardMaterial({ color: '#c9c6c0', roughness: 0.9 });
const steel = new THREE.MeshStandardMaterial({ color: '#3a3b3d', roughness: 0.5, metalness: 0.6 });

function Lamp({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={2.6} material={steel}>
        <cylinderGeometry args={[0.05, 0.07, 5.2, 10]} />
      </mesh>
      <mesh position={[0, 5.2, 0]} material={steel}>
        <boxGeometry args={[0.18, 0.12, 0.5]} />
      </mesh>
    </group>
  );
}

/** Lodrät logotyp på fasaden, läses uppifrån och ned (som på HK). */
function VerticalLogo() {
  const tex = useLogoTexture({ height: 512 });
  if (!tex) return null;
  const len = TOP_Y - H - 0.4; // logotypens längd längs fasaden
  const thick = len / (tex.userData.aspect || 4);
  return (
    <mesh position={[maxX - 1.6, H + 0.4 + len / 2 + 1.0, maxZ + 0.2]} rotation-z={-Math.PI / 2}>
      <planeGeometry args={[len, thick]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} />
    </mesh>
  );
}

export default function Exterior() {
  const W = maxX - minX, D = maxZ - minZ;
  const upper = ROOF - H; // fasadens höjd ovanför entréplanets skyltfönster
  return (
    <group>
      <Sky />
      {/* fasadbeklädnad: sidor, baksida och attika ovanför taket */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 + 0.16), ROOF / 2, (minZ + maxZ) / 2]} rotation-y={s * Math.PI / 2} material={cladding(D, ROOF)}>
          <planeGeometry args={[D + 0.32, ROOF]} />
        </mesh>
      ))}
      <mesh position={[0, ROOF / 2, minZ - 0.16]} rotation-y={Math.PI} material={cladding(W, ROOF)}>
        <planeGeometry args={[W + 0.32, ROOF]} />
      </mesh>
      <mesh position={[0, TOP_Y + (ROOF - TOP_Y) / 2, maxZ + 0.16]} material={cladding(W, ROOF - TOP_Y)}>
        <planeGeometry args={[W + 0.32, ROOF - TOP_Y]} />
      </mesh>
      <mesh position={[0, ROOF + 0.01, (minZ + maxZ) / 2]} rotation-x={-Math.PI / 2} material={concrete}>
        <planeGeometry args={[W + 0.32, D + 0.32]} />
      </mesh>
      {/* höger del av framsidan: hel glasbeklädnad med den lodräta logotypen */}
      <mesh position={[maxX - 1.6, H + upper / 2, maxZ + 0.17]} material={cladding(3.2, upper)}>
        <planeGeometry args={[3.36, upper]} />
      </mesh>
      <VerticalLogo />
      {/* svart vertikal slits */}
      <mesh position={[minX - 0.05, ROOF / 2, maxZ + 0.1]} material={steel}>
        <boxGeometry args={[0.9, ROOF, 0.4]} />
      </mesh>
      {/* gata och gräsremsa framför torget */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, maxZ + 18]} raycast={() => null}>
        <planeGeometry args={[120, 8]} />
        <meshStandardMaterial color="#3e3f42" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, maxZ + 13]} raycast={() => null}>
        <planeGeometry args={[120, 2.2]} />
        <meshStandardMaterial color="#6f8f4e" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} raycast={() => null}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#7c8a63" roughness={1} />
      </mesh>
      {/* betongbänkar och gatlyktor */}
      {[-9, 9].map((x) => (
        <mesh key={x} position={[x, 0.25, maxZ + 3.2]} material={concrete}>
          <boxGeometry args={[3.2, 0.5, 0.7]} />
        </mesh>
      ))}
      {[-12.5, -4.5, 4.5, 12.5].map((x) => <Lamp key={x} x={x} z={maxZ + 7.5} />)}
      {/* björkar */}
      <Birch x={minX - 5} z={maxZ + 4} h={7.5} seed={2} />
      <Birch x={maxX + 5.5} z={maxZ + 3} h={8.5} seed={5} />
      <Birch x={minX - 7.5} z={maxZ - 3} h={9} seed={7} />
      <Birch x={maxX + 8} z={maxZ - 6} h={7} seed={11} />
      <Birch x={-13} z={maxZ + 10.5} h={6.5} seed={13} />
      <Birch x={14} z={maxZ + 10.5} h={7} seed={17} />
    </group>
  );
}
