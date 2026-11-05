import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ESCALATOR, FLOOR_H, PLAYER, inEscalatorLanes, rampHeight } from '../config/storeConfig.js';
import { input, player } from '../nav/playerState.js';
import { navGrids, rampWorld, worlds } from '../nav/world.js';
import { useStore } from '../state/useStore.js';

const PITCH_LIMIT = 1.25;
const E = ESCALATOR;
const UP = E.lanes.find((l) => l.dir > 0);
const DOWN = E.lanes.find((l) => l.dir < 0);

/** Vilken våning spelaren "räknas" till just nu (på rulltrappan: närmaste). */
function currentLevel() {
  if (player.mode === 'ramp') return player.y > FLOOR_H / 2 ? 1 : 0;
  return player.level;
}

/**
 * Väg till ett mål, även på en annan våning: gå till rätt rulltrappa,
 * åk upp/ned och fortsätt till målet.
 */
function planPath(nav) {
  const from = { x: player.x, z: player.z };
  const to = { x: nav.x, z: nav.z };
  const target = nav.level ?? currentLevel();
  const here = currentLevel();
  if (target === here && player.mode !== 'ramp') return navGrids[here]?.findPath(from, to);
  if (player.mode === 'ramp') {
    // redan på rulltrappan: åk klart åt det håll trappan går, fortsätt sedan
    const lane = player.x < E.divider ? UP : DOWN;
    const endLevel = lane.dir > 0 ? 1 : 0;
    const off = lane.dir > 0 ? { x: lane.x, z: E.zExit + 0.6 } : { x: lane.x, z: E.zEntry - 0.6 };
    const rest = navGrids[endLevel]?.findPath(off, endLevel === target ? to : off) ?? [];
    return [{ x: lane.x, z: player.z }, off, ...rest];
  }
  const lane = target > here ? UP : DOWN;
  const start = lane.dir > 0 ? { x: lane.x, z: E.zEntry - 0.6 } : { x: lane.x, z: E.zExit + 0.6 };
  const end = lane.dir > 0 ? { x: lane.x, z: E.zExit + 0.6 } : { x: lane.x, z: E.zEntry - 0.6 };
  const a = navGrids[here]?.findPath(from, start);
  const b = navGrids[target]?.findPath(end, to);
  if (!a || !b) return null;
  return [...a, { x: lane.x, z: lane.dir > 0 ? E.zEntry + 0.1 : E.zExit - 0.1 }, end, ...b];
}

/** Byter mellan golv och rulltrappa beroende på position. */
function updateMode() {
  const lane = inEscalatorLanes(player.x);
  if (player.mode === 'floor') {
    if (lane && player.level === 0 && player.z > E.zEntry + 0.35 && player.z < E.zTop) player.mode = 'ramp';
    else if (lane && player.level === 1 && player.z < E.zExit - 0.35 && player.z > E.zBottom) player.mode = 'ramp';
  } else {
    if (player.z < E.zEntry + 0.2) { player.mode = 'floor'; player.level = 0; }
    else if (player.z > E.zExit - 0.2) { player.mode = 'floor'; player.level = 1; }
  }
  player.y = player.mode === 'ramp' ? rampHeight(player.z) : player.level * FLOOR_H;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Förstapersonskamera: tangentbord, joystick, titt-rörelser, klick-för-att-gå
 * (A*-väg) och kollision mot väggar och möbler.
 */
export default function Player() {
  const camera = useThree((s) => s.camera);
  const vel = useRef(new THREE.Vector2());
  const path = useRef(null); // { id, points: [{x,z}], lookAt }
  const lookTarget = useRef(null);
  const eyeY = useRef(PLAYER.eyeHeight);

  // Nya navigeringsförfrågningar (klick på golv, minikarta, tur, önskelista).
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.nav === prev.nav) return;
        if (!s.nav) {
          path.current = null;
          return;
        }
        const pts = planPath(s.nav);
        if (!pts || !pts.length) {
          path.current = null;
          useStore.getState().showToast('Dit går det inte att gå.');
          return;
        }
        path.current = { id: s.nav.id, points: pts, lookAt: s.nav.lookAt };
        lookTarget.current = null;
      }),
    []
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = useStore.getState();
    const frozen = state.tryOn.open;

    // --- titta
    player.yaw += input.look.yaw;
    player.pitch = THREE.MathUtils.clamp(player.pitch + input.look.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    const manualLook = input.look.yaw !== 0 || input.look.pitch !== 0;
    input.look.yaw = input.look.pitch = 0;

    // --- manuell förflyttning
    const k = input.keys;
    let fwd = 0, side = 0, turn = 0;
    if (!frozen) {
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD')) side += 1;
      if (k.has('KeyA')) side -= 1;
      if (k.has('ArrowRight')) turn -= 1;
      if (k.has('ArrowLeft')) turn += 1;
      fwd += -input.joy.y;
      side += input.joy.x;
    }
    player.yaw += turn * 1.9 * dt;
    const manual = Math.abs(fwd) > 0.05 || Math.abs(side) > 0.05 || turn !== 0;
    if (manual && (path.current || state.tour.active)) {
      path.current = null;
      if (state.nav) state.cancelNav();
      if (state.tour.active) state.setTour({ active: false, caption: '' });
    }

    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    let desiredX = 0, desiredZ = 0;

    if (manual) {
      const len = Math.min(1, Math.hypot(fwd, side));
      const n = Math.hypot(fwd, side) || 1;
      const f = (fwd / n) * len, s = (side / n) * len;
      desiredX = (-sin * f + cos * s) * speed;
      desiredZ = (-cos * f - sin * s) * speed;
    } else if (path.current && !frozen) {
      // --- följ väg
      const p = path.current;
      let target = p.points[0];
      let dx = target.x - player.x, dz = target.z - player.z;
      let dist = Math.hypot(dx, dz);
      while (dist < 0.18 && p.points.length > 1) {
        p.points.shift();
        target = p.points[0];
        dx = target.x - player.x;
        dz = target.z - player.z;
        dist = Math.hypot(dx, dz);
      }
      if (dist < 0.12 && p.points.length === 1) {
        const done = p;
        path.current = null;
        if (done.lookAt) lookTarget.current = { ...done, yaw: Math.atan2(-(done.lookAt[0] - player.x), -(done.lookAt[1] - player.z)) };
        else state.notifyArrived(done.id);
        if (state.nav?.id === done.id) state.cancelNav();
      } else {
        const sp = PLAYER.walkSpeed * 1.15 * Math.min(1, dist / 0.6 + 0.3);
        desiredX = (dx / dist) * sp;
        desiredZ = (dz / dist) * sp;
        // vänd kameran mjukt mot gångriktningen
        if (!manualLook && dist > 0.4) {
          const want = Math.atan2(-dx, -dz);
          player.yaw += angleDiff(player.yaw, want) * Math.min(1, dt * 3.2);
          player.pitch += (0.02 - player.pitch) * Math.min(1, dt * 2);
        }
      }
    }

    // Vrid mot målpunkten efter ankomst (zonhopp, tur).
    if (lookTarget.current) {
      const lt = lookTarget.current;
      const d = angleDiff(player.yaw, lt.yaw);
      player.yaw += d * Math.min(1, dt * 3.5);
      player.pitch += (-0.05 - player.pitch) * Math.min(1, dt * 3);
      if (Math.abs(d) < 0.02 || manual || manualLook) {
        lookTarget.current = null;
        state.notifyArrived(lt.id);
      }
    }

    const a = 1 - Math.exp(-dt * 10);
    vel.current.x += (desiredX - vel.current.x) * a;
    vel.current.y += (desiredZ - vel.current.y) * a;

    // --- flytta + kollision (delsteg för att inte tunnla genom tunna väggar)
    const pos = { x: player.x, z: player.z };
    // rulltrappan rör sig: upp-trappan mot +z, ned-trappan mot −z
    const belt = player.mode === 'ramp' ? (player.x < E.divider ? UP.dir : DOWN.dir) * E.speed : 0;
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      pos.x += (vel.current.x * dt) / steps;
      pos.z += ((vel.current.y + belt) * dt) / steps;
      (player.mode === 'ramp' ? rampWorld : worlds[player.level]).resolve(pos, PLAYER.radius);
    }
    player.x = pos.x;
    player.z = pos.z;
    updateMode();

    // lätt gång-gungning
    const moving = Math.hypot(vel.current.x, vel.current.y);
    const bob = Math.sin(performance.now() / 160) * 0.012 * Math.min(1, moving / 2);

    // mjuk höjdövergång (t.ex. när man kliver av rulltrappan)
    eyeY.current += (player.y + PLAYER.eyeHeight + bob - eyeY.current) * Math.min(1, dt * 14);
    camera.position.set(player.x, eyeY.current, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  });

  return null;
}
