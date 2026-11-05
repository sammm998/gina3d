import { ESCALATOR, FLOOR_H, STORE, VOID } from '../config/storeConfig.js';
import { CollisionWorld } from './collision.js';
import { NavGrid } from './pathfinding.js';

/**
 * Kollisionsvärldar:
 *   worlds[0]  entréplan (inkl. fasad med dörr och gallerian utanför)
 *   worlds[1]  övre plan (räcken runt schaktet)
 *   rampWorld  på rulltrappan (sidoräcken + mittdelare)
 * Varje våning har ett eget A*-rutnät (navGrids[level]).
 */
export const worlds = [new CollisionWorld(), new CollisionWorld()];
export const rampWorld = new CollisionWorld();
export const navGrids = [null, null];

/** Bakåtkompatibelt: entréplanets värld/rutnät. */
export const world = worlds[0];
export let navGrid = null;

function addShell(w, withDoor) {
  const { minX, maxX, minZ, maxZ, door } = STORE;
  const t = 0.12;
  w.addRect(minX - 1, minZ - 1, maxX + 1, minZ); // bakvägg
  w.addRect(minX - 1, minZ - 1, minX, maxZ); // vänster vägg
  w.addRect(maxX, minZ - 1, maxX + 1, maxZ); // höger vägg
  if (withDoor) {
    w.addRect(minX - 1, maxZ - t, door.minX, maxZ + t);
    w.addRect(door.maxX, maxZ - t, maxX + 1, maxZ + t);
  } else {
    w.addRect(minX - 1, maxZ - t, maxX + 1, maxZ + 1);
  }
}

export function buildWorld(fixtures = []) {
  const { maxZ, outside, minX, maxX, minZ } = STORE;
  const E = ESCALATOR;
  worlds.forEach((w) => w.clear());
  rampWorld.clear();

  // --- entréplan
  const g = worlds[0];
  addShell(g, true);
  g.addRect(outside.minX - 1, maxZ, outside.minX, outside.maxZ + 1);
  g.addRect(outside.maxX, maxZ, outside.maxX + 1, outside.maxZ + 1);
  g.addRect(outside.minX - 1, outside.maxZ, outside.maxX + 1, outside.maxZ + 1);
  // rulltrappans sidor och den höga änden (man kliver på från baksidan, −z)
  g.addRect(E.minX - 0.06, E.zEntry + 0.2, E.minX + 0.04, E.zExit + 0.05);
  g.addRect(E.maxX - 0.04, E.zEntry + 0.2, E.maxX + 0.06, E.zExit + 0.05);
  g.addRect(E.minX - 0.06, E.zExit - 0.05, E.maxX + 0.06, E.zExit + 0.05);

  // --- övre plan: räcken runt schaktet, öppet mot rulltrappans övre platå (+z)
  const u = worlds[1];
  addShell(u, false);
  u.addRect(E.minX - 0.06, VOID.minZ - 0.06, E.minX + 0.04, VOID.maxZ + 0.17);
  u.addRect(E.maxX - 0.04, VOID.minZ - 0.06, E.maxX + 0.06, VOID.maxZ + 0.17);
  u.addRect(E.minX - 0.06, VOID.minZ - 0.06, E.maxX + 0.06, VOID.minZ + 0.04);

  // --- på rulltrappan: tre räcken (vänster, mitten, höger)
  for (const x of [E.minX, E.divider, E.maxX]) rampWorld.addRect(x - 0.05, E.zEntry - 0.5, x + 0.05, E.zExit + 0.4);

  for (const f of fixtures) {
    const w = worlds[f.level || 0];
    for (const c of f.colliders ?? []) {
      if (c.rect) w.addRect(...c.rect);
      else if (c.circle) w.addCircle(...c.circle);
    }
  }

  navGrids[0] = new NavGrid(g, { minX, maxX, minZ, maxZ: outside.maxZ }, 0.2, 0.34);
  navGrids[1] = new NavGrid(u, { minX, maxX, minZ, maxZ }, 0.2, 0.34);
  navGrid = navGrids[0];
  return worlds;
}

export const levelY = (level) => (level || 0) * FLOOR_H;
