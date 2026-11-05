/**
 * Grundläggande mått och sökvägar för butiken.
 * Koordinatsystem: meter. x = vänster/höger, z = djup (entrén ligger vid +z), y = upp.
 * Butiken är 25 × 15 m och centrerad kring origo.
 */
export const STORE = {
  width: 25,
  depth: 15,
  height: 3.5,
  minX: -12.5,
  maxX: 12.5,
  minZ: -7.5,
  maxZ: 7.5,
  wallThickness: 0.2,
  /** Dörröppningen i glasfasaden (x-intervall). */
  door: { minX: -1.8, maxX: 1.8 },
  /** Gallerian utanför butiken där besökaren startar. */
  outside: { minX: -12, maxX: 12, maxZ: 13.5 },
};

export const PLAYER = {
  eyeHeight: 1.62,
  radius: 0.3,
  walkSpeed: 2.2,
  runSpeed: 4.2,
  start: { x: 0, z: 12.2, yaw: 0, pitch: 0.06 },
};

export const PATHS = {
  // Varumärkets logotyp (tillhandahållen). Byt till .svg här om du har en vektorversion.
  logo: '/assets/ginatricot-logo.png',
  logoFallback: '/assets/logo-placeholder.svg',
  products: '/data/products.json',
  campaign: [
    '/assets/campaign/campaign-1.jpg',
    '/assets/campaign/campaign-2.jpg',
    '/assets/campaign/campaign-3.jpg',
    '/assets/campaign/campaign-4.jpg',
  ],
  photos: [
    '/assets/photos/photo-1.jpg',
    '/assets/photos/photo-2.jpg',
    '/assets/photos/photo-3.jpg',
    '/assets/photos/photo-4.jpg',
    '/assets/photos/photo-5.jpg',
  ],
};

/**
 * Valfria .glb-modeller. Sätt en sökväg för att ersätta den inbyggda
 * low-poly-modellen, t.ex. mannequin: '/assets/models/mannequin.glb'.
 * Modellen skalas inte automatiskt – exportera i meter med origo vid golvet.
 */
export const MODELS = {
  mannequin: null,
  plant: null,
  podium: null,
  screen: null,
};

/** Två våningar: entréplan (level 0) och övre plan (level 1). */
export const FLOOR_H = 4.0; // golv till golv
export const LEVELS = [
  { id: 0, name: 'Entréplan', short: 'Plan 1' },
  { id: 1, name: 'Övre plan', short: 'Plan 2' },
];

/**
 * Rulltrappor längs högerväggen: en upp och en ned, sida vid sida.
 * Längs z: nedre platå (zEntry–zBottom) → lutning 30° (zBottom–zTop) → övre platå (zTop–zExit).
 */
export const ESCALATOR = {
  minX: 9.0,
  maxX: 11.8,
  divider: 10.4,
  lanes: [
    { id: 'up', x: 9.7, dir: 1, label: 'Upp' },
    { id: 'down', x: 11.1, dir: -1, label: 'Ned' },
  ],
  zEntry: -6.4,
  zBottom: -5.2,
  zTop: 1.73,
  zExit: 2.9,
  rise: FLOOR_H,
  speed: 0.5, // m/s
};

/** Öppningen i bjälklaget ovanför rulltrapporna. */
export const VOID = { minX: 9.0, maxX: 11.8, minZ: -3.3, maxZ: ESCALATOR.zTop };

/** Höjd på rulltrappans steg vid en viss z-position. */
export function rampHeight(z) {
  const e = ESCALATOR;
  if (z <= e.zBottom) return 0;
  if (z >= e.zTop) return e.rise;
  return ((z - e.zBottom) / (e.zTop - e.zBottom)) * e.rise;
}

export function inEscalatorLanes(x) {
  return x > ESCALATOR.minX && x < ESCALATOR.maxX;
}
