import { useEffect, useRef, useState } from 'react';
import { ESCALATOR, LEVELS, STORE, VOID } from '../config/storeConfig.js';
import { ZONES, zonesOnLevel } from '../config/zones.js';
import { FIXTURES } from '../config/fixtures.js';
import { player } from '../nav/playerState.js';
import { useStore } from '../state/useStore.js';
import { t } from '../i18n/index.js';

const VB = { x: STORE.minX - 0.6, y: STORE.minZ - 0.6, w: STORE.width + 1.2, h: STORE.depth + 3.2 };

/** Minikarta med zoner, spelarens position och snabbhopp. */
export default function Minimap({ onNavigate }) {
  const dot = useRef(null);
  const svg = useRef(null);
  const navigateTo = useStore((s) => s.navigateTo);
  const [level, setLevel] = useState(player.level);
  const [follow, setFollow] = useState(true);
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    let raf;
    let last = player.level;
    const tick = () => {
      // kartan följer den våning man står på, tills man själv väljer en annan
      if (player.level !== last) {
        last = player.level;
        if (follow) setLevel(player.level);
      }
      if (dot.current) {
        dot.current.style.display = (player.mode === 'ramp' || player.level === levelRef.current) ? '' : 'none';
        const x = Math.max(VB.x + 0.3, Math.min(VB.x + VB.w - 0.3, player.x));
        const z = Math.max(VB.y + 0.3, Math.min(VB.y + VB.h - 0.3, player.z));
        dot.current.setAttribute('transform', `translate(${x} ${z}) rotate(${(-player.yaw * 180) / Math.PI})`);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [follow]);

  const goZone = (zone) => {
    const v = zone.viewpoint;
    navigateTo(v.x, v.z, v.lookAt, zone.level || 0);
    useStore.getState().setTour({ active: false, caption: '' });
    onNavigate?.();
  };

  const onMapClick = (e) => {
    const el = svg.current;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(el.getScreenCTM().inverse());
    navigateTo(p.x, p.y, null, level);
    onNavigate?.();
  };

  return (
    <div className="minimap">
      <div className="minimap__levels" role="tablist" aria-label="Våning">
        {LEVELS.map((l) => (
          <button key={l.id} role="tab" aria-selected={level === l.id} className={`chip ${level === l.id ? 'is-active' : ''}`}
            onClick={() => { setLevel(l.id); setFollow(l.id === player.level); }}>
            {l.short} · {l.name}
          </button>
        ))}
      </div>
      <svg ref={svg} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} onClick={onMapClick} role="img" aria-label={t('map.title')}>
        <rect x={STORE.minX} y={STORE.minZ} width={STORE.width} height={STORE.depth} fill="#fff" stroke="#111" strokeWidth="0.12" />
        {zonesOnLevel(level).map((z) => {
          const [x0, z0, x1, z1] = z.rect;
          return (
            <g key={z.id}>
              <rect x={x0} y={z0} width={x1 - x0} height={z1 - z0} fill={z.color} stroke="#fff" strokeWidth="0.1" />
              <text x={(x0 + x1) / 2} y={(z0 + z1) / 2} className="minimap__label">{z.name}</text>
            </g>
          );
        })}
        {/* rulltrappor */}
        <rect x={ESCALATOR.minX} y={level === 0 ? ESCALATOR.zEntry : VOID.minZ} width={ESCALATOR.maxX - ESCALATOR.minX} height={(level === 0 ? ESCALATOR.zExit : ESCALATOR.zExit) - (level === 0 ? ESCALATOR.zEntry : VOID.minZ)} className="minimap__escalator" />
        <text x={(ESCALATOR.minX + ESCALATOR.maxX) / 2} y={level === 0 ? ESCALATOR.zEntry - 0.45 : ESCALATOR.zExit + 0.55} className="minimap__label">{level === 0 ? 'Upp ↑' : 'Ned ↓'}</text>
        {FIXTURES.filter((f) => f.map && (f.level || 0) === level).map((f, i) =>
          f.map.circle ? (
            <circle key={i} cx={f.map.circle[0]} cy={f.map.circle[1]} r={f.map.circle[2]} className="minimap__fixture" />
          ) : (
            <rect key={i} x={f.map.rect[0]} y={f.map.rect[1]} width={f.map.rect[2] - f.map.rect[0]} height={f.map.rect[3] - f.map.rect[1]} className="minimap__fixture" />
          )
        )}
        {/* entré */}
        {level === 0 && <line x1={STORE.door.minX} y1={STORE.maxZ} x2={STORE.door.maxX} y2={STORE.maxZ} stroke="#fff" strokeWidth="0.3" />}
        {level === 0 && <text x="0" y={STORE.maxZ + 1.4} className="minimap__label minimap__label--muted">Entré</text>}
        <g ref={dot}>
          <path d="M0 -0.75 L0.45 0.35 L0 0.1 L-0.45 0.35 Z" fill="#111" />
          <circle r="0.9" fill="rgba(17,17,17,0.08)" />
        </g>
      </svg>
      <div className="minimap__jumps">
        {ZONES.map((z) => (
          <button key={z.id} className="chip" onClick={() => goZone(z)} title={LEVELS[z.level || 0].name}>
            {t('map.goto')} {z.name}{z.level ? ' ↑' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
