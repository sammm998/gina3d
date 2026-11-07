import { STORE } from '../config/storeConfig.js';
import { useLogoTexture } from './fixtures/Decor.jsx';

/**
 * Den belysta skylten ovanför entrén: logotypen (från /assets/ginatricot-logo.svg)
 * direkt på fasadbandet (transparent, ingen ljuslåda). Logotypen ritas inte av koden.
 */
export default function Storefront() {
  const tex = useLogoTexture({ height: 512 });
  const y = STORE.height + 0.75;
  const z = STORE.maxZ + 0.105;
  const width = 7.2;
  const h = tex ? Math.min(1.3, width / (tex.userData.aspect || 5)) : 1.0;
  const w = tex ? h * (tex.userData.aspect || 5) : width;
  return (
    <group>
      {tex && (
        <mesh position={[0, y, z + 0.004]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} color="#ffffff" depthWrite={false} />
        </mesh>
      )}
      {/* tunn ljuslist under skylten som lyser upp fasaden */}
      <mesh position={[0, STORE.height + 0.02, STORE.maxZ + 0.1]}>
        <boxGeometry args={[STORE.width, 0.03, 0.04]} />
        <meshBasicMaterial color="#fff6e8" toneMapped={false} />
      </mesh>
    </group>
  );
}
