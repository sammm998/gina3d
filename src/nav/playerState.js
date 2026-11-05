import { PLAYER } from '../config/storeConfig.js';

/**
 * Snabbt föränderligt spelartillstånd. Hålls utanför React så att minikartan
 * och kameran kan läsa/skriva varje bildruta utan omrenderingar.
 */
export const player = {
  x: PLAYER.start.x,
  z: PLAYER.start.z,
  yaw: PLAYER.start.yaw,
  pitch: PLAYER.start.pitch,
  /** 0 = entréplan, 1 = övre plan (på rulltrappan: den våning man senast stod på). */
  level: 0,
  /** 'floor' eller 'ramp' (på rulltrappan) */
  mode: 'floor',
  /** golvhöjd under fötterna */
  y: 0,
};

/** Inmatning från tangentbord och virtuell joystick. */
export const input = {
  keys: new Set(),
  joy: { x: 0, y: 0 },
  /** Ackumulerad titt-rörelse (radianer) som kameran förbrukar varje bildruta. */
  look: { yaw: 0, pitch: 0 },
};

export function resetPlayer() {
  Object.assign(player, { x: PLAYER.start.x, z: PLAYER.start.z, yaw: PLAYER.start.yaw, pitch: PLAYER.start.pitch, level: 0, mode: 'floor', y: 0 });
}
