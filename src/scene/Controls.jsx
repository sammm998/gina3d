import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { input } from '../nav/playerState.js';
import { useStore } from '../state/useStore.js';

const DRAG_SPEED = 0.0042;   // radianer per pixel (dra-för-att-titta)
const LOCK_SPEED = 0.0022;   // radianer per pixel (pointer lock)
const TOUCH_SPEED = 0.0055;

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/** Hittar produkt-id genom att gå uppåt i scengrafen. */
export function findProductId(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.productId) return o.userData.productId;
  return null;
}

/**
 * DOM-händelser för att titta och gå:
 *  - musdrag / svep: titta runt (markören syns, så man kan klicka på produkter)
 *  - L eller knappen i gränssnittet: pointer lock (FPS-läge, sikte i mitten)
 *  - WASD / piltangenter (+ Shift för att springa)
 */
export default function Controls() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const drag = useRef(null);
  const ray = useRef(new THREE.Raycaster());
  const frame = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';
    el.classList.add('canvas-grab');

    const blocked = () => {
      const s = useStore.getState();
      return !s.entered || s.tryOn.open;
    };

    const onDown = (e) => {
      if (blocked()) return;
      if (document.pointerLockElement === el) {
        pickCenter(true);
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (drag.current) return; // redan ett aktivt finger
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType };
      el.classList.add('canvas-grabbing');
    };
    const onMove = (e) => {
      if (document.pointerLockElement === el) {
        input.look.yaw -= e.movementX * LOCK_SPEED;
        input.look.pitch -= e.movementY * LOCK_SPEED;
        return;
      }
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const k = d.type === 'touch' ? TOUCH_SPEED : DRAG_SPEED;
      // "Ta tag i världen": dra åt höger -> vyn roterar åt vänster.
      input.look.yaw += (e.clientX - d.x) * k;
      input.look.pitch += (e.clientY - d.y) * k;
      d.x = e.clientX;
      d.y = e.clientY;
    };
    const onUp = (e) => {
      if (drag.current?.id === e.pointerId) {
        drag.current = null;
        el.classList.remove('canvas-grabbing');
      }
    };
    const onKeyDown = (e) => {
      if (isTyping(e) || blocked()) return;
      if (e.code === 'KeyL') {
        if (document.pointerLockElement === el) document.exitPointerLock();
        else el.requestPointerLock?.();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      input.keys.add(e.code);
    };
    const onKeyUp = (e) => input.keys.delete(e.code);
    const onBlur = () => input.keys.clear();
    const onLockChange = () => {
      const locked = document.pointerLockElement === el;
      useStore.getState().setPointerLocked(locked);
      if (locked) useStore.getState().setHovered(null);
    };
    const onRequestLock = () => el.requestPointerLock?.();

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('gt3d:request-lock', onRequestLock);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('gt3d:request-lock', onRequestLock);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  /** Raycast från skärmens mitt (pointer lock-läge). */
  function pickCenter(click) {
    ray.current.setFromCamera({ x: 0, y: 0 }, camera);
    ray.current.far = 30;
    const hits = ray.current.intersectObjects(scene.children, true);
    const s = useStore.getState();
    for (const h of hits) {
      if (!h.object.visible) continue;
      const pid = findProductId(h.object);
      if (pid) {
        if (click) {
          document.exitPointerLock();
          s.select(pid);
        } else if (s.hovered?.id !== pid) {
          s.setHovered({ id: pid, x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
        return;
      }
      if (h.object.userData?.walkable) {
        if (click) s.navigateTo(h.point.x, h.point.z);
        break;
      }
      if (h.object.userData?.action && click) {
        h.object.userData.action();
        return;
      }
      if (!h.object.userData?.passThrough) break;
    }
    if (!click && s.hovered) s.setHovered(null);
  }

  // Hover via siktet i pointer lock-läge (var 6:e bildruta räcker).
  useFrame(() => {
    if (!useStore.getState().pointerLocked) return;
    if (++frame.current % 6 === 0) pickCenter(false);
  });

  return null;
}
