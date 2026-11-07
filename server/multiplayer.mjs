/**
 * Live-multiplayer: besökare som är inne samtidigt ser varandra.
 * WebSocket på /ws. Klienten skickar sin position ~8 gånger/s; servern
 * skickar en ögonblicksbild av alla andra ~8 gånger/s. Inga personuppgifter –
 * bara position, riktning och vilken avatar man har.
 */
import { WebSocketServer } from 'ws';

const MAX = 60;
const AVATARS = 4;

export function attachMultiplayer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const players = new Map(); // ws -> state
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return; // andra uppgraderingar (t.ex. Vites HMR) lämnas orörda
    if (players.size >= MAX) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const id = nextId++;
    const me = { id, av: id % AVATARS, x: 0, z: 13, y: 0, level: 0, yaw: 0, moving: false, at: Date.now() };
    players.set(ws, me);
    ws.send(JSON.stringify({ t: 'hello', id, av: me.av }));
    ws.on('message', (buf) => {
      let m;
      try { m = JSON.parse(buf); } catch { return; }
      if (m?.t !== 'pos') return;
      const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
      const x = num(m.x, -40, 40), z = num(m.z, -40, 40), y = num(m.y, -1, 30), yaw = num(m.yaw, -100, 100), level = num(m.level, 0, 9);
      if (x == null || z == null) return;
      Object.assign(me, { x, z, y: y ?? me.y, yaw: yaw ?? me.yaw, level: level ?? me.level, moving: !!m.moving, at: Date.now() });
    });
    ws.on('close', () => players.delete(ws));
    ws.on('error', () => players.delete(ws));
  });

  setInterval(() => {
    const now = Date.now();
    const all = [...players.values()].filter((p) => now - p.at < 15000);
    for (const [ws, me] of players) {
      if (ws.readyState !== 1) continue;
      const others = all.filter((p) => p !== me).map(({ id, av, x, z, y, level, yaw, moving }) => ({ id, av, x, z, y, level, yaw, moving }));
      ws.send(JSON.stringify({ t: 'snap', online: all.length, players: others }));
    }
  }, 125);
  console.log('Multiplayer: WebSocket på /ws');
}
