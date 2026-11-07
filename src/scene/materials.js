import * as THREE from 'three';

/**
 * Delade material – återanvänds av alla möbler för färre shaderbyten
 * och bättre prestanda. Gina Tricot-paletten: vitt, svart och krämvitt.
 */
export const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: '#f7f6f3', roughness: 0.92 }),
  baseboard: new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.8 }),
  black: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.45, metalness: 0.3 }),
  blackMatte: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.75 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#cfcfcf', roughness: 0.2, metalness: 0.9 }),
  cream: new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.7 }),
  creamLight: new THREE.MeshStandardMaterial({ color: '#f5f0e7', roughness: 0.65 }),
  white: new THREE.MeshStandardMaterial({ color: '#fbfbf9', roughness: 0.6 }),
  oak: new THREE.MeshStandardMaterial({ color: '#d4bf9f', roughness: 0.7 }),
  mannequin: new THREE.MeshStandardMaterial({ color: '#f4f3f0', roughness: 0.38 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#fbfbfa', roughness: 1 }),
  facadeBand: new THREE.MeshStandardMaterial({ color: '#e1e6e9', roughness: 0.35, metalness: 0.25 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#dfe9ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14,
    depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4,
  }),
  screenFrame: new THREE.MeshStandardMaterial({ color: '#101010', roughness: 0.3, metalness: 0.5 }),
  plantPot: new THREE.MeshStandardMaterial({ color: '#e9e3d8', roughness: 0.85 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3f6b3a', roughness: 0.75, side: THREE.DoubleSide }),
  leafLight: new THREE.MeshStandardMaterial({ color: '#58834a', roughness: 0.75, side: THREE.DoubleSide }),
  soil: new THREE.MeshStandardMaterial({ color: '#3b2e25', roughness: 1 }),
  curtain: new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.95 }),
  mirror: new THREE.MeshStandardMaterial({ color: '#d9e1e4', roughness: 0.02, metalness: 1, envMapIntensity: 1.2 }),
};
