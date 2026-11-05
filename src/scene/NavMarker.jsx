import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../state/useStore.js';

/** Ring på golvet som visar vart man är på väg. */
export default function NavMarker() {
  const ref = useRef();
  const mat = useRef();
  useFrame(({ clock }) => {
    const nav = useStore.getState().nav;
    const m = ref.current;
    if (!nav) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(nav.x, 0.012, nav.z);
    const t = clock.elapsedTime;
    const s = 1 + Math.sin(t * 4) * 0.08;
    m.scale.set(s, s, s);
    mat.current.opacity = 0.65 + Math.sin(t * 4) * 0.2;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} visible={false} raycast={() => null} renderOrder={3}>
      <ringGeometry args={[0.18, 0.24, 40]} />
      <meshBasicMaterial ref={mat} color="#111111" transparent depthWrite={false} />
    </mesh>
  );
}
