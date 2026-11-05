import { ESCALATORS, FLOOR_H, LEVELS, STORE, voidOf } from '../config/storeConfig.js';
import { CollisionWorld } from './collision.js';
import { NavGrid } from './pathfinding.js';

/**
 * Kollisionsvärldar:
 *   worlds[level]     en per våning (entréplanet har fasad med dörr och gallerian utanför)
 *   rampWorlds[i]     på rulltrappa i (sidoräcken + mittdelare)
 * Varje våning har ett eget A*-rutnät (navGrids[level]).
 */
export const worlds = LEVELS.map(() => new CollisionWorld());
export const rampWorlds = ESCALATORS.map(() => new CollisionWorld());
export const navGrids = LEVELS.map(() => null);

function addShell(w, withDoor) {
  const { minX, maxX, minZ, maxZ, door } = STORE;
  const t = 0.12;
  w.addRect(minX - 1, minZ - 1, maxX + 1, minZ);
  w.addRect(minX - 1, minZ - 1, minX, maxZ);
  w.addRect(maxX, minZ - 1, maxX + 1, maxZ);
  if (withDoor) {
    w.addRect(minX - 1, maxZ - t, door.minX, maxZ + t);
    w.addRect(door.maxX, maxZ - t, maxX + 1, maxZ + t);
  } else {
    w.addRect(minX - 1, maxZ - t, maxX + 1, maxZ + 1);
  }
}

export function buildWorld(fixtures = []) {
  const { maxZ, outside, minX, maxX, minZ } = STORE;
  worlds.forEach((w) => w.clear());
  rampWorlds.forEach((w) => w.clear());

  worlds.forEach((w, level) => addShell(w, level === 0));
  const g = worlds[0];
  g.addRect(outside.minX - 1, maxZ, outside.minX, outside.maxZ + 1);
  g.addRect(outside.maxX, maxZ, outside.maxX + 1, outside.maxZ + 1);
  g.addRect(outside.minX - 1, outside.maxZ, outside.maxX + 1, outside.maxZ + 1);

  ESCALATORS.forEach((E, i) => {
    // nedre våningen: sidorna och den höga änden (man kliver på från −z)
    const lo = worlds[E.fromLevel];
    lo.addRect(E.minX - 0.06, E.zEntry + 0.2, E.minX + 0.04, E.zExit + 0.05);
    lo.addRect(E.maxX - 0.04, E.zEntry + 0.2, E.maxX + 0.06, E.zExit + 0.05);
    lo.addRect(E.minX - 0.06, E.zExit - 0.05, E.maxX + 0.06, E.zExit + 0.05);
    // övre våningen: räcken runt schaktet, öppet mot övre platån (+z)
    const hi = worlds[E.fromLevel + 1];
    const V = voidOf(E);
    hi.addRect(E.minX - 0.06, V.minZ - 0.06, E.minX + 0.04, V.maxZ + 0.17);
    hi.addRect(E.maxX - 0.04, V.minZ - 0.06, E.maxX + 0.06, V.maxZ + 0.17);
    hi.addRect(E.minX - 0.06, V.minZ - 0.06, E.maxX + 0.06, V.minZ + 0.04);
    // på trappan
    for (const x of [E.minX, E.divider, E.maxX]) rampWorlds[i].addRect(x - 0.05, E.zEntry - 0.5, x + 0.05, E.zExit + 0.4);
  });

  for (const f of fixtures) {
    const w = worlds[f.level || 0];
    for (const c of f.colliders ?? []) {
      if (c.rect) w.addRect(...c.rect);
      else if (c.circle) w.addCircle(...c.circle);
    }
  }

  worlds.forEach((w, level) => {
    navGrids[level] = new NavGrid(w, { minX, maxX, minZ, maxZ: level === 0 ? outside.maxZ : maxZ }, 0.2, 0.34);
  });
  return worlds;
}

export const levelY = (level) => (level || 0) * FLOOR_H;
