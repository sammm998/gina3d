import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Lazy-loading av texturer: en bild hämtas först när kameran kommer inom
 * `distance` meter. Max fyra samtidiga nedladdningar; allt cachas per URL.
 */
const loader = new THREE.TextureLoader();
const cache = new Map();
const queue = [];
let active = 0;
const MAX_CONCURRENT = 4;

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    active++;
    loader.load(
      job.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        active--;
        job.resolve(tex);
        pump();
      },
      undefined,
      (err) => {
        active--;
        job.reject(err);
        pump();
      }
    );
  }
}

export function requestTexture(url, priority = false) {
  if (!url) return Promise.reject(new Error('ingen url'));
  if (!cache.has(url)) {
    const entry = {};
    entry.promise = new Promise((resolve, reject) => {
      const job = { url, resolve: (t) => { entry.tex = t; resolve(t); }, reject };
      priority ? queue.unshift(job) : queue.push(job);
      pump();
    });
    entry.promise.catch(() => {});
    cache.set(url, entry);
  }
  return cache.get(url).promise;
}

export function getCachedTexture(url) {
  return cache.get(url)?.tex ?? null;
}

const tmp = new THREE.Vector3();

/** Returnerar texturen (eller null tills den laddats). position: [x, y, z]. */
export function useLazyTexture(url, position, distance = 16) {
  const [tex, setTex] = useState(() => getCachedTexture(url));
  const requested = useRef(!!tex);
  const frame = useRef(Math.floor(Math.random() * 20));

  useEffect(() => {
    const cached = getCachedTexture(url);
    setTex(cached);
    requested.current = !!cached;
  }, [url]);

  useFrame(({ camera }) => {
    if (requested.current || !url) return;
    if (++frame.current % 20 !== 0) return;
    tmp.set(position[0], position[1], position[2]);
    if (camera.position.distanceTo(tmp) < distance) {
      requested.current = true;
      requestTexture(url).then(setTex).catch(() => {});
    }
  });
  return tex;
}
