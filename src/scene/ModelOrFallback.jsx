import { Component, Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

/**
 * Laddar en .glb-modell och placerar den på möbelns position/rotation.
 * Om filen saknas eller inte går att läsa visas den inbyggda low-poly-modellen.
 */
class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn('Kunde inte läsa .glb – visar inbyggd modell.', err?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Model({ url, f }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clone} position={[f.x, f.y || 0, f.z]} rotation-y={f.rot || 0} scale={f.scale || 1} />;
}

export default function ModelOrFallback({ url, f, fallback }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Model url={url} f={f} />
      </Suspense>
    </Boundary>
  );
}
