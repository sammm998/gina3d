/**
 * Härledd information om produkter: färgkoder, hur de visas i butiken och
 * vilken typ av AR-provning som gäller. Allt kan överstyras i products.json.
 */

/** Svenska färgnamn -> hex. colors[] får också innehålla { name, hex } eller "#rrggbb". */
export const COLOR_HEX = {
  svart: '#1d1d1f', vit: '#f4f2ee', offwhite: '#ece6da', beige: '#d8c7ae', kamel: '#b98a5a',
  champagne: '#e6d3b3', ljusblå: '#a9c1d9', mellanblå: '#5f7fa6', mörkblå: '#2f4466',
  'ljus denim': '#9db6cf', grå: '#9b9b9b', gråmelerad: '#b3b1ad', marinblå: '#24304a',
  smaragd: '#1f5c4a', cognac: '#8a4f2a', rosa: '#e7b9b6', brun: '#5a3d2b', röd: '#a4262c',
  oliv: '#6b6b45', blå: '#4f6f9a', ljusgrå: '#cfcdc8', mörkgrå: '#4a4a4a', creme: '#efe6d4',
  krämvit: '#efe8dc', ljusrosa: '#efd0cc', vinröd: '#6e1f2a', 'mörk denim': '#2c3e5c', 'denimblå': '#5f7fa6',
  khaki: '#a39a72', sand: '#d6c4a3', turkos: '#3f9a96', orange: '#d9783a', mint: '#bfe0cf', grön: '#3f6b4a', gul: '#e4c86a', lila: '#8a6f9e', silver: '#c0c0c0', guld: '#c9a84f',
};

export function colorName(c) {
  return typeof c === 'string' ? c : c?.name ?? '';
}

export function colorHex(c, fallback = '#bbbbbb') {
  if (!c) return fallback;
  if (typeof c === 'object') return c.hex || COLOR_HEX[String(c.name).toLowerCase()] || fallback;
  if (c.startsWith('#')) return c;
  const key = c.toLowerCase();
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  // okänt namn: stabil, dämpad färg från namnet
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 18%, ${45 + (h % 25)}%)`;
}

export function primaryHex(product) {
  return colorHex(product.colors?.[0]);
}

const ACCESSORY = ['accessories', 'bags', 'shoes', 'jewellery', 'jewelry', 'scarves', 'belts'];
const OUTER = ['outerwear', 'jackets', 'coats', 'blazers'];
const LOWER = ['jeans', 'denim', 'trousers', 'pants', 'shorts'];
const SKIRT = ['skirts'];
const FULL = ['dresses', 'jumpsuits'];

export function isAccessory(p) {
  return ACCESSORY.includes(p.category);
}

/**
 * Plaggklass för visning och skyltdockor:
 * 'upper' | 'outer' | 'lower' | 'skirt' | 'full' | 'accessory'
 */
export function garmentClass(p) {
  if (isAccessory(p)) return 'accessory';
  if (p.tryOnType === 'upper') return OUTER.includes(p.category) ? 'outer' : 'upper';
  if (p.tryOnType === 'lower') return SKIRT.includes(p.category) ? 'skirt' : 'lower';
  if (p.tryOnType === 'full') return 'full';
  if (OUTER.includes(p.category)) return 'outer';
  if (LOWER.includes(p.category)) return 'lower';
  if (SKIRT.includes(p.category)) return 'skirt';
  if (FULL.includes(p.category)) return 'full';
  return 'upper';
}

/**
 * AR-provningens typ: 'upper' (axlar–höfter), 'lower' (höfter–knän),
 * 'full' (axlar–knän) eller null (kan inte provas).
 */
export function tryOnType(p) {
  if (p.tryOnType) return p.tryOnType === 'none' ? null : p.tryOnType;
  const g = garmentClass(p);
  if (g === 'accessory') return null;
  if (g === 'outer' || g === 'upper') return 'upper';
  if (g === 'lower' || g === 'skirt') return 'lower';
  return 'full';
}

export function canTryOn(p) {
  return !!p && !!p.tryOnImage && !!tryOnType(p);
}

/** Kan plagget visas vikt på bord/hyllor? */
export function isFoldable(p) {
  const g = garmentClass(p);
  return g === 'upper' || g === 'lower';
}

/** Ungefärlig längd (m) på ett hängande plagg. */
export function hangLength(p) {
  return { upper: 0.68, outer: 0.98, lower: 1.0, skirt: 0.62, full: 1.12, accessory: 0.3 }[garmentClass(p)];
}

export function accessoryKind(p) {
  const n = `${p.name} ${p.category}`.toLowerCase();
  if (p.category === 'shoes' || /sko|loafer|sneaker|boots|stövel|sandal|pump/.test(n)) return 'shoes';
  if (/shopper|tote|mulepåse/.test(n)) return 'tote';
  if (p.category === 'bags' || /väska|bag/.test(n)) return 'bag';
  return 'other';
}
