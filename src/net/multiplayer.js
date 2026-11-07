import { player } from '../nav/playerState.js';
import { useStore } from '../state/useStore.js';

/** Andra besökare (id -> { x, z, y, level, yaw, moving, av, tx, tz, ty, tyaw }). */
export const others = new Map();
let ws = null;
let timer = null;
let retry = 1000;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(`${proto}//${location.host}/ws`);
  } catch {
    return;
  }
  ws.onopen = () => {
    retry = 1000;
    let last = { x: player.x, z: player.z };
    timer = setInterval(() => {
      if (ws.readyState !== 1) return;
      const moving = Math.hypot(player.x - last.x, player.z - last.z) > 0.02;
      last = { x: player.x, z: player.z };
      ws.send(JSON.stringify({ t: 'pos', x: +player.x.toFixed(2), z: +player.z.toFixed(2), y: +(player.y || 0).toFixed(2), level: player.level, yaw: +player.yaw.toFixed(3), moving }));
    }, 125);
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t !== 'snap') return;
    const seen = new Set();
    for (const p of m.players) {
      seen.add(p.id);
      const o = others.get(p.id);
      if (o) Object.assign(o, { tx: p.x, tz: p.z, ty: p.y, tyaw: p.yaw, level: p.level, moving: p.moving });
      else others.set(p.id, { ...p, tx: p.x, tz: p.z, ty: p.y, tyaw: p.yaw });
    }
    for (const id of others.keys()) if (!seen.has(id)) others.delete(id);
    const s = useStore.getState();
    if (s.online !== m.online || s.othersVersion !== others.size) s.setOnline(m.online, others.size);
  };
  ws.onclose = () => {
    clearInterval(timer);
    others.clear();
    useStore.getState().setOnline(0, 0);
    setTimeout(connect, (retry = Math.min(retry * 2, 30000)));
  };
}

export function startMultiplayer() {
  if (!ws) connect();
}
