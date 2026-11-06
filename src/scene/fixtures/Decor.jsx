import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MAT } from '../materials.js';
import { PATHS } from '../../config/storeConfig.js';
import { imageToTexture, textTexture } from '../textures.js';
import { requestTexture, useLazyTexture } from '../useLazyTexture.js';
import { useStore } from '../../state/useStore.js';

function useAsync(factory, deps) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let alive = true;
    factory().then((v) => alive && setValue(v)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Logotypen som textur – läses från /assets/ginatricot-logo.svg (eller platshållaren). */
export function useLogoTexture({ background = null, height = 512, padding = 0 } = {}) {
  return useAsync(() => imageToTexture(PATHS.logo, { fallbackUrl: PATHS.logoFallback, background, height, padding }), [background, height, padding]);
}

/** Stående digital skärm med roterande kampanjbilder (dubbelsidig). */
export function DigitalScreen({ f }) {
  const urls = useMemo(() => f.images.map((i) => PATHS.campaign[i % PATHS.campaign.length]), [f.images]);
  const first = useLazyTexture(urls[0], [f.x, 1.3, f.z], 22);
  const matRef = useRef();
  const idx = useRef(0);
  const timer = useRef(Math.random() * 3);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ececec', toneMapped: false }), []);

  useEffect(() => {
    if (first) {
      mat.map = first;
      mat.color.set('#f2f2f2');
      mat.needsUpdate = true;
    }
  }, [first, mat]);

  useFrame((_, dt) => {
    if (!first) return;
    timer.current += dt;
    if (timer.current > 6) {
      timer.current = 0;
      idx.current = (idx.current + 1) % urls.length;
      requestTexture(urls[idx.current]).then((t) => {
        mat.map = t;
        mat.needsUpdate = true;
      }).catch(() => {});
    }
  });

  const W = 0.62, H = 1.1;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position-y={0.02} material={MAT.screenFrame}>
        <boxGeometry args={[0.7, 0.04, 0.4]} />
      </mesh>
      <mesh position-y={0.42} material={MAT.screenFrame}>
        <boxGeometry args={[0.06, 0.8, 0.06]} />
      </mesh>
      <mesh position-y={1.35} material={MAT.screenFrame}>
        <boxGeometry args={[W + 0.04, H + 0.04, 0.06]} />
      </mesh>
      <mesh ref={matRef} position={[0, 1.35, 0.031]} material={mat}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[0, 1.35, -0.031]} rotation-y={Math.PI} material={mat}>
        <planeGeometry args={[W, H]} />
      </mesh>
    </group>
  );
}

/** Krukväxt: kruka + instansierade blad, slumpade deterministiskt per id. */
const leafGeom = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.09, 0.12, 0, 0.3);
  s.quadraticCurveTo(-0.09, 0.12, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  return g;
})();
const potGeom = new THREE.LatheGeometry(
  [[0, 0], [0.17, 0], [0.2, 0.05], [0.23, 0.48], [0.235, 0.5], [0.21, 0.5], [0, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)),
  28
);

export function Plant({ f }) {
  const ref = useRef();
  const ref2 = useRef();
  const count = 70;
  const leaves = useMemo(() => {
    let seed = [...f.id].reduce((a, c) => a + c.charCodeAt(0), 0) * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const arr = [];
    for (let i = 0; i < count; i++) {
      const h = 0.55 + rnd() * 1.0;
      const a = rnd() * Math.PI * 2;
      const r = 0.05 + rnd() * 0.32 * (h / 1.5);
      arr.push({ pos: [Math.cos(a) * r, h, Math.sin(a) * r], rot: [-0.6 - rnd() * 0.9, a + Math.PI / 2, (rnd() - 0.5) * 0.6], s: 0.8 + rnd() * 0.7, light: rnd() > 0.55 });
    }
    return arr;
  }, [f.id]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let a = 0, b = 0;
    for (const l of leaves) {
      q.setFromEuler(new THREE.Euler(l.rot[0], l.rot[1], l.rot[2], 'YXZ'));
      m.compose(new THREE.Vector3(...l.pos), q, new THREE.Vector3(l.s, l.s, l.s));
      if (l.light) ref2.current.setMatrixAt(b++, m);
      else ref.current.setMatrixAt(a++, m);
    }
    ref.current.count = a;
    ref2.current.count = b;
    ref.current.instanceMatrix.needsUpdate = true;
    ref2.current.instanceMatrix.needsUpdate = true;
  }, [leaves]);
  return (
    <group position={[f.x, 0, f.z]} scale={f.size}>
      <mesh geometry={potGeom} material={MAT.plantPot} />
      <mesh position-y={0.47} rotation-x={-Math.PI / 2} material={MAT.soil}>
        <circleGeometry args={[0.21, 20]} />
      </mesh>
      <mesh position-y={0.9} material={MAT.soil}>
        <cylinderGeometry args={[0.012, 0.018, 0.9, 6]} />
      </mesh>
      <instancedMesh ref={ref} args={[leafGeom, MAT.leaf, count]} />
      <instancedMesh ref={ref2} args={[leafGeom, MAT.leafLight, count]} />
    </group>
  );
}

/**
 * Beskär en textur som CSS "object-fit: cover" för en yta med bredd/höjd = aspect
 * (bilden sträcks aldrig ut). Klonen delar bilddata med originalet.
 */
export function useCoverTexture(tex, aspect) {
  return useMemo(() => {
    if (!tex?.image) return null;
    const t = tex.clone();
    const ia = (tex.image.width || 1) / (tex.image.height || 1);
    if (ia > aspect) {
      t.repeat.set(aspect / ia, 1);
      t.offset.set((1 - aspect / ia) / 2, 0);
    } else {
      // stående foto i liggande ram: behåll överdelen (ansikte/överkropp)
      t.repeat.set(1, ia / aspect);
      t.offset.set(0, 1 - ia / aspect - (1 - ia / aspect) * 0.25);
    }
    t.needsUpdate = true;
    return t;
  }, [tex, aspect]);
}

/** Inramat modefoto på väggen (svart ram, vit passepartout). */
export function FramedPhoto({ f }) {
  const url = PATHS.photos[f.image % PATHS.photos.length];
  const border = 0.035, mat = 0.07;
  const iw = f.w - (border + mat) * 2, ih = f.h - (border + mat) * 2;
  const tex = useCoverTexture(useLazyTexture(url, [f.x, f.y, f.z], 20), iw / ih);
  return (
    <group position={[f.x, f.y, f.z]} rotation-y={f.rot}>
      <mesh position-z={0.015} material={MAT.black}>
        <boxGeometry args={[f.w, f.h, 0.03]} />
      </mesh>
      <mesh position-z={0.036} material={MAT.white}>
        <planeGeometry args={[f.w - border * 2, f.h - border * 2]} />
      </mesh>
      <mesh position-z={0.044}>
        <planeGeometry args={[iw, ih]} />
        <meshStandardMaterial key={tex ? 'tex' : 'none'} map={tex} color={tex ? '#ffffff' : '#ddd6cc'} roughness={0.35} envMapIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** Stor bakbelyst kampanjbild – tunn aluminiumram och självlysande bild. */
export function Lightbox({ f }) {
  const url = PATHS.campaign[f.image % PATHS.campaign.length];
  const frame = 0.05;
  const tex = useCoverTexture(useLazyTexture(url, [f.x, f.y, f.z], 26), (f.w - frame * 2) / (f.h - frame * 2));
  return (
    <group position={[f.x, f.y, f.z]} rotation-y={f.rot}>
      <mesh position-z={0.045} material={MAT.chrome}>
        <boxGeometry args={[f.w, f.h, 0.09]} />
      </mesh>
      <mesh position-z={0.098} raycast={() => null}>
        <planeGeometry args={[f.w - frame * 2, f.h - frame * 2]} />
        <meshBasicMaterial key={tex ? 'tex' : 'none'} map={tex} color={tex ? '#f4f1ec' : '#e9e4dc'} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Fristående affischställ i svart metall med bild på båda sidor. */
export function PosterStand({ f }) {
  const url = PATHS.photos[f.image % PATHS.photos.length];
  const pw = f.w - 0.06, ph = f.h - 0.5;
  const tex = useCoverTexture(useLazyTexture(url, [f.x, 1.2, f.z], 18), pw / ph);
  const y0 = 0.38;
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      {/* fot */}
      <mesh position-y={0.012} material={MAT.black}>
        <boxGeometry args={[0.84, 0.024, 0.4]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (f.w - 0.02)) / 2, f.h / 2, 0]} material={MAT.black}>
          <boxGeometry args={[0.022, f.h, 0.022]} />
        </mesh>
      ))}
      <mesh position={[0, f.h - 0.011, 0]} material={MAT.black}>
        <boxGeometry args={[f.w, 0.022, 0.022]} />
      </mesh>
      <mesh position={[0, y0 - 0.011, 0]} material={MAT.black}>
        <boxGeometry args={[f.w, 0.022, 0.022]} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, y0 + ph / 2 + 0.03, s * 0.006]} rotation-y={s < 0 ? Math.PI : 0}>
          <planeGeometry args={[pw, ph]} />
          <meshStandardMaterial key={tex ? 'tex' : 'none'} map={tex} color={tex ? '#ffffff' : '#ddd6cc'} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Tunn, gemen text på väggen, t.ex. "denim". */
export function WallText({ f }) {
  const tex = useMemo(() => textTexture(f.text, { weight: 200, size: 260, color: '#151515', letterSpacing: 6 }), [f.text]);
  const w = f.height * (tex.userData.aspect || 3);
  return (
    <mesh position={[f.x, f.y, f.z]} rotation-y={f.rot} raycast={() => null}>
      <planeGeometry args={[w, f.height]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Logotyp direkt på väggen (svart på vitt). vertical = läses uppifrån och ned. */
export function WallLogo({ f }) {
  const tex = useLogoTexture({ height: 256 });
  if (!tex) return null;
  const h = f.width / (tex.userData.aspect || 4);
  return (
    <mesh position={[f.x, f.y, f.z]} rotation={[0, f.rot, f.vertical ? -Math.PI / 2 : 0]} raycast={() => null}>
      <planeGeometry args={[f.width, h]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Två provrum med draperier mot bakväggen. */
const curtainGeom = (() => {
  const g = new THREE.PlaneGeometry(1.18, 2.15, 40, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 34) * 0.025);
  g.computeVertexNormals();
  return g;
})();

export function FittingRooms({ f }) {
  const booth = f.w / 2;
  const label = useMemo(() => textTexture('PROVRUM', { weight: 500, size: 90, color: '#1a1a1a', letterSpacing: 10 }), []);
  return (
    <group position={[f.x, 0, f.z]}>
      {/* väggar mellan och runt hytterna */}
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * booth, 1.25, f.d / 2]} material={MAT.white}>
          <boxGeometry args={[0.06, 2.5, f.d]} />
        </mesh>
      ))}
      <mesh position={[0, 2.38, f.d]} material={MAT.white}>
        <boxGeometry args={[f.w + 0.06, 0.24, 0.06]} />
      </mesh>
      <mesh position={[0, 2.38, f.d + 0.032]} raycast={() => null}>
        <planeGeometry args={[0.9, 0.9 / (label.userData.aspect || 4)]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
      {[-0.5, 0.5].map((i) => (
        <group key={i} position-x={i * booth}>
          {/* draperiet är draget åt sidan – man kan gå in */}
          <mesh position={[-booth / 2 + 0.2, 1.2, f.d - 0.05]} scale={[0.32, 1, 1]} geometry={curtainGeom} material={MAT.curtain} />
          <mesh position={[0, 2.27, f.d - 0.05]} rotation-z={Math.PI / 2} material={MAT.black}>
            <cylinderGeometry args={[0.008, 0.008, booth - 0.08, 6]} />
          </mesh>
          {/* helfigursspegel på bakväggen */}
          <mesh position={[0, 1.15, 0.035]} material={MAT.black}>
            <boxGeometry args={[0.66, 1.8, 0.03]} />
          </mesh>
          <mesh position={[0, 1.15, 0.052]} material={MAT.mirror}>
            <planeGeometry args={[0.6, 1.74]} />
          </mesh>
          {/* pall och krokar */}
          <mesh position={[0.48, 0.22, 0.3]} material={MAT.cream}>
            <cylinderGeometry args={[0.17, 0.17, 0.44, 24]} />
          </mesh>
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position={[x, 1.75, 0.06]} rotation-x={Math.PI / 2} material={MAT.black}>
              <cylinderGeometry args={[0.008, 0.008, 0.08, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Virtuell provspegel på väggen – klick öppnar AR-provningen. */
export function TryOnMirror({ f }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 1024);
    grd.addColorStop(0, '#e8edef');
    grd.addColorStop(1, '#cfd7db');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 1024);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(60, 0); g.lineTo(220, 0); g.lineTo(40, 700); g.lineTo(0, 700); g.lineTo(0, 200);
    g.fill();
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.font = '500 30px Inter Variable, Inter, Arial, sans-serif';
    g.fillText('VIRTUELL PROVSPEGEL', 256, 470);
    g.font = '300 26px Inter Variable, Inter, Arial, sans-serif';
    g.fillText('Klicka här för att prova', 256, 520);
    g.fillText('plagg med kameran', 256, 556);
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.strokeRect(150, 600, 212, 56);
    g.font = '500 22px Inter Variable, Inter, Arial, sans-serif';
    g.fillText('PROVA NU', 256, 636);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const open = () => {
    const s = useStore.getState();
    s.openTryOn(s.selectedId || null);
  };
  const [hover, setHover] = useState(false);
  return (
    <group position={[f.x, 0, f.z]} rotation-y={f.rot}>
      <mesh position={[0, 1.2, 0.02]} material={MAT.black}>
        <boxGeometry args={[0.92, 1.92, 0.04]} />
      </mesh>
      <mesh
        position={[0, 1.2, 0.041]}
        userData={{ action: open }}
        onClick={(e) => {
          if (e.delta > 6 || useStore.getState().pointerLocked) return;
          e.stopPropagation();
          open();
        }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.classList.add('is-hovering'); }}
        onPointerOut={() => { setHover(false); document.body.classList.remove('is-hovering'); }}
      >
        <planeGeometry args={[0.86, 1.86]} />
        <meshBasicMaterial map={tex} toneMapped={false} color={hover ? '#ffffff' : '#f0f0f0'} />
      </mesh>
    </group>
  );
}
