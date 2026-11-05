import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ESCALATORS, FLOOR_H, PLAYER, inLanes, rampHeight } from '../config/storeConfig.js';
import { input, player } from '../nav/playerState.js';
import { navGrids, rampWorlds, worlds } from '../nav/world.js';
import { useStore } from '../state/useStore.js';

const PITCH_LIMIT = 1.25;
const laneOf = (E, dir) => E.lanes.find((l) => Math.sign(l.dir) === dir);

/** Vilken våning spelaren "räknas" till just nu (på rulltrappan: närmaste). */
function currentLevel() {
  if (player.mode === 'ramp') {
    const E = ESCALATORS[player.esc];
    return E.fromLevel + (player.y - E.fromLevel * FLOOR_H > FLOOR_H / 2 ? 1 : 0);
  }
  return player.level;
}

/** Ett åk: gå till trappans start, åk, kliv av. Returnerar { start, ride, end, level }. */
function rideLeg(level, dir) {
  const E = ESCALATORS.find((e) => e.fromLevel === (dir > 0 ? level : level - 1));
  if (!E) return null;
  const lane = laneOf(E, dir);
  const low = { x: lane.x, z: E.zEntry - 0.6 };
  const high = { x: lane.x, z: E.zExit + 0.6 };
  return dir > 0
    ? { start: low, ride: { x: lane.x, z: E.zEntry + 0.1 }, end: high, level: level + 1 }
    : { start: high, ride: { x: lane.x, z: E.zExit - 0.1 }, end: low, level: level - 1 };
}

/**
 * Väg till ett mål, även flera våningar bort: gå till rätt rulltrappa, åk
 * (en eller flera gånger) och fortsätt till målet.
 */
function planPath(nav) {
  const to = { x: nav.x, z: nav.z };
  const target = nav.level ?? currentLevel();
  let pts = [];
  let here = currentLevel();
  let from = { x: player.x, z: player.z };
  if (player.mode === 'ramp') {
    // åk klart åt det håll trappan går och fortsätt därifrån
    const E = ESCALATORS[player.esc];
    const dir = player.x < E.divider ? 1 : -1;
    const lane = laneOf(E, dir);
    const off = dir > 0 ? { x: lane.x, z: E.zExit + 0.6 } : { x: lane.x, z: E.zEntry - 0.6 };
    pts.push({ x: lane.x, z: player.z }, off);
    here = E.fromLevel + (dir > 0 ? 1 : 0);
    from = off;
  }
  while (here !== target) {
    const leg = rideLeg(here, target > here ? 1 : -1);
    if (!leg) return null;
    const a = navGrids[here]?.findPath(from, leg.start);
    if (!a) return null;
    pts.push(...a, leg.ride, leg.end);
    here = leg.level;
    from = leg.end;
  }
  const last = navGrids[here]?.findPath(from, to);
  if (!last) return null;
  return [...pts, ...last];
}

/** Byter mellan golv och rulltrappa beroende på position. */
function updateMode() {
  if (player.mode === 'floor') {
    for (let i = 0; i < ESCALATORS.length; i++) {
      const E = ESCALATORS[i];
      if (!inLanes(player.x, E)) continue;
      const onLow = player.level === E.fromLevel && player.z > E.zEntry + 0.35 && player.z < E.zTop;
      const onHigh = player.level === E.fromLevel + 1 && player.z < E.zExit - 0.35 && player.z > E.zBottom;
      if (onLow || onHigh) {
        player.mode = 'ramp';
        player.esc = i;
        break;
      }
    }
  } else {
    const E = ESCALATORS[player.esc];
    if (player.z < E.zEntry + 0.2) { player.mode = 'floor'; player.level = E.fromLevel; }
    else if (player.z > E.zExit - 0.2) { player.mode = 'floor'; player.level = E.fromLevel + 1; }
  }
  player.y = player.mode === 'ramp'
    ? ESCALATORS[player.esc].fromLevel * FLOOR_H + rampHeight(player.z, ESCALATORS[player.esc])
    : player.level * FLOOR_H;
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
    const esc = player.mode === 'ramp' ? ESCALATORS[player.esc] : null;
    const belt = esc ? (player.x < esc.divider ? 1 : -1) * esc.speed : 0;
    const steps = 2;
    for (let i = 0; i < steps; i++) {
      pos.x += (vel.current.x * dt) / steps;
      pos.z += ((vel.current.y + belt) * dt) / steps;
      (esc ? rampWorlds[player.esc] : worlds[player.level]).resolve(pos, PLAYER.radius);
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
