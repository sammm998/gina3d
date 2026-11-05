import { STORE } from '../config/storeConfig.js';
import { CollisionWorld } from './collision.js';
import { NavGrid } from './pathfinding.js';

export const world = new CollisionWorld();
export let navGrid = null;

/**
 * Bygger kollisionsvärlden: butiksväggar, glasfasad med dörröppning,
 * gallerians gränser samt alla möbler som har en `colliders`-lista.
 */
export function buildWorld(fixtures = []) {
  world.clear();
  const { minX, maxX, minZ, maxZ, door, outside } = STORE;
  const t = 0.12;
  world.addRect(minX - 1, minZ - 1, maxX + 1, minZ);           // bakvägg
  world.addRect(minX - 1, minZ - 1, minX, maxZ);               // vänster vägg
  world.addRect(maxX, minZ - 1, maxX + 1, maxZ);               // höger vägg
  world.addRect(minX - 1, maxZ - t, door.minX, maxZ + t);      // fasad vänster
  world.addRect(door.maxX, maxZ - t, maxX + 1, maxZ + t);      // fasad höger
  world.addRect(outside.minX - 1, maxZ, outside.minX, outside.maxZ + 1); // galleria vänster
  world.addRect(outside.maxX, maxZ, outside.maxX + 1, outside.maxZ + 1); // galleria höger
  world.addRect(outside.minX - 1, outside.maxZ, outside.maxX + 1, outside.maxZ + 1); // galleria bortre

  for (const f of fixtures) {
    for (const c of f.colliders ?? []) {
      if (c.rect) world.addRect(...c.rect);
      else if (c.circle) world.addCircle(...c.circle);
    }
  }

  navGrid = new NavGrid(world, { minX, maxX, minZ, maxZ: outside.maxZ }, 0.2, 0.34);
  return world;
}
