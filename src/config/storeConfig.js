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

/** Tre våningar: entréplan (level 0), plan 2 (level 1) och plan 3 (level 2). */
export const FLOOR_H = 4.0; // golv till golv
export const LEVELS = [
  { id: 0, name: 'Entréplan', short: 'Plan 1' },
  { id: 1, name: 'Klänningar & fest', short: 'Plan 2' },
  { id: 2, name: 'Stickat & byxor', short: 'Plan 3' },
];
export const TOP_Y = (LEVELS.length - 1) * FLOOR_H + STORE.height; // översta taket

/**
 * Rulltrappor. Varje par (upp + ned) går från `fromLevel` till våningen ovanför.
 * Längs z: nedre platå (zEntry–zBottom) → lutning 30° (zBottom–zTop) → övre platå (zTop–zExit).
 */
const RUN = { zEntry: -6.4, zBottom: -5.2, zTop: 1.73, zExit: 2.9, rise: FLOOR_H, speed: 0.5 };
export const ESCALATORS = [
  {
    id: 'e1', fromLevel: 0, minX: 9.0, maxX: 11.8, divider: 10.4, ...RUN,
    lanes: [{ id: 'up', x: 9.7, dir: 1 }, { id: 'down', x: 11.1, dir: -1 }],
  },
  {
    id: 'e2', fromLevel: 1, minX: 6.0, maxX: 8.8, divider: 7.4, ...RUN,
    lanes: [{ id: 'up', x: 6.7, dir: 1 }, { id: 'down', x: 8.1, dir: -1 }],
  },
];
/** Bakåtkompatibelt: den första rulltrappan. */
export const ESCALATOR = ESCALATORS[0];

/** Öppningen i bjälklaget ovanför en rulltrappa. */
export function voidOf(esc) {
  return { minX: esc.minX, maxX: esc.maxX, minZ: -3.3, maxZ: esc.zTop };
}
export const VOID = voidOf(ESCALATORS[0]);

/** Hål i golvet på en våning (rulltrappan underifrån) resp. i taket (rulltrappan uppåt). */
export const floorHoleOf = (level) => ESCALATORS.filter((e) => e.fromLevel === level - 1).map(voidOf);
export const ceilingHoleOf = (level) => ESCALATORS.filter((e) => e.fromLevel === level).map(voidOf);

/** Höjd (relativt rulltrappans nedre våning) vid en viss z-position. */
export function rampHeight(z, esc = ESCALATORS[0]) {
  if (z <= esc.zBottom) return 0;
  if (z >= esc.zTop) return esc.rise;
  return ((z - esc.zBottom) / (esc.zTop - esc.zBottom)) * esc.rise;
}

export function inLanes(x, esc = ESCALATORS[0]) {
  return x > esc.minX && x < esc.maxX;
}
export const inEscalatorLanes = (x) => inLanes(x, ESCALATORS[0]);
