import { useRef, useState } from 'react';
import { input } from '../nav/playerState.js';

const RADIUS = 48;

/** Virtuell joystick för mobil. Skriver till input.joy (−1…1). */
export default function Joystick() {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const pid = useRef(null);

  const update = (e) => {
    const r = base.current.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2);
    let y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > RADIUS) {
      x = (x / d) * RADIUS;
      y = (y / d) * RADIUS;
    }
    input.joy.x = x / RADIUS;
    input.joy.y = y / RADIUS;
    setKnob({ x, y, active: true });
  };
  const end = () => {
    pid.current = null;
    input.joy.x = input.joy.y = 0;
    setKnob({ x: 0, y: 0, active: false });
  };

  return (
    <div
      ref={base}
      className={`joystick ${knob.active ? 'is-active' : ''}`}
      aria-label="Joystick för att gå"
      onPointerDown={(e) => {
        e.stopPropagation();
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => pid.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
