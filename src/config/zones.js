/**
 * Butikens zoner.
 *
 * - rect:       zonens yta i golvplanet [minX, minZ, maxX, maxZ] (används av minikartan)
 * - categories: vilka produktkategorier (product.category) som hör hemma i zonen
 * - viewpoint:  var besökaren ställs när man "hoppar" till zonen eller under guidad tur
 *               { x, z, lookAt: [x, z] }
 * - tour:       text som visas under den guidade turen
 *
 * - level:      0 = entréplan, 1 = övre plan (nås med rulltrappan)
 *
 * Lägg till en ny zon genom att lägga till ett objekt här och möbler med samma
 * `zone`-id i src/config/fixtures.js. Se README.
 */
export const ZONES = [
  {
    id: 'entrance',
    name: 'Entré',
    color: '#efe9df',
    rect: [-12.5, 3.5, 12.5, 7.5],
    categories: [],
    viewpoint: { x: 0, z: 6.4, lookAt: [0, 2] },
    tour: 'Välkommen! Vid entrén visar skyltdockorna säsongens looks.',
  },
  {
    id: 'denim',
    name: 'Denim',
    color: '#dde5ee',
    rect: [-12.5, -7.5, -7, 3.5],
    categories: ['jeans', 'denim'],
    viewpoint: { x: -8.2, z: 1.8, lookAt: [-12.4, -2.4] },
    tour: 'Denimväggen – jeans i alla passformer, vikta och sorterade.',
  },
  {
    id: 'tops',
    name: 'Toppar',
    color: '#f1ece4',
    rect: [-7, -3.5, 0, 3.5],
    categories: ['tops', 'shirts', 'blouses', 'knitwear', 'trousers'],
    viewpoint: { x: -1.2, z: 3.0, lookAt: [-4.2, 0] },
    tour: 'Toppar, blusar och stickat på bord i två nivåer.',
  },
  {
    id: 'accessories',
    name: 'Accessoarer',
    color: '#ece6dc',
    rect: [0, -3.5, 7, 3.5],
    categories: ['accessories', 'bags', 'shoes', 'jewellery'],
    viewpoint: { x: 1.4, z: 3.0, lookAt: [4.2, 0] },
    tour: 'Väskor, skor och accessoarer som gör looken komplett.',
  },
  {
    id: 'escalator',
    name: 'Rulltrappa',
    color: '#e4e4e2',
    rect: [7, -3.5, 12.5, 3.5],
    categories: [],
    viewpoint: { x: 8.3, z: -4.3, lookAt: [10.4, 2.5] },
    tour: 'Rulltrappan tar dig upp till klänningar, fest och nyheter.',
  },
  {
    id: 'dresses',
    level: 1,
    name: 'Klänningar',
    color: '#f0e6e3',
    rect: [-12.5, -7.5, 0, 7.5],
    categories: ['dresses', 'skirts'],
    viewpoint: { x: -1.5, z: 4.6, lookAt: [-8, -3] },
    tour: 'Övre plan: klänningar och kjolar för både vardag och fest.',
  },
  {
    id: 'party',
    level: 1,
    name: 'Fest & nyheter',
    color: '#ece6dc',
    rect: [0, -7.5, 12.5, 7.5],
    categories: [],
    viewpoint: { x: 3.0, z: 4.8, lookAt: [6, -4] },
    tour: 'Säsongens nyheter och festplagg – direkt vid rulltrappan.',
  },
  {
    id: 'outerwear',
    name: 'Ytterkläder',
    color: '#e7e3da',
    rect: [0, -7.5, 12.5, -3.5],
    categories: ['outerwear', 'jackets', 'coats'],
    viewpoint: { x: 4.1, z: -2.6, lookAt: [4.1, -7.4] },
    tour: 'Kappor, trenchcoats och jackor inför säsongen.',
  },
  {
    id: 'checkout',
    name: 'Kassa & provrum',
    color: '#e9e9e9',
    rect: [-7, -7.5, 0, -3.5],
    categories: [],
    viewpoint: { x: -3.2, z: -2.8, lookAt: [-3.4, -7.4] },
    tour: 'Kassan och provrummen – här finns även den virtuella provspegeln.',
  },
];

/** Ordningen för den guidade turen. */
export const TOUR_ORDER = ['entrance', 'tops', 'denim', 'checkout', 'outerwear', 'accessories', 'dresses', 'party'];

/** Hittar vilken zon en produktkategori hör till. */
export function zoneForCategory(category) {
  const c = String(category || '').toLowerCase();
  return ZONES.find((z) => z.categories.includes(c))?.id ?? 'tops';
}

export function zonesOnLevel(level) {
  return ZONES.filter((z) => (z.level || 0) === level);
}

export function zoneById(id) {
  return ZONES.find((z) => z.id === id);
}
