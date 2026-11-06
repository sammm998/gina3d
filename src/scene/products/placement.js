import { zoneForCategory } from '../../config/zones.js';
import { fabricKind, garmentClass, isAccessory, isFoldable, primaryHex } from '../../data/productMeta.js';

/**
 * Placerar produkterna automatiskt på möblernas produktplatser (slots)
 * utifrån produktens category -> zon (zones.js).
 *
 * Varje slot-typ tar emot olika produkter:
 *   fold       vikta travar (toppar, jeans)          – från möbelns zon
 *   faceout    framåtvänt hängande plagg              – från möbelns zon
 *   side       sidohängda plagg på stång              – från möbelns zon
 *   accessory  skor och väskor (lägre nivåer)         – alla accessoarer
 *   mannequin  hela looks på skyltdockor              – alla plagg
 *
 * En möbel kan ange `pool: 'new'` (blandade nyheter) eller `pool: 'accessories'`.
 * Saknas lämpliga produkter i zonen används en reserv så att inget står tomt.
 */
export function placeProducts(products, fixtures) {
  const garments = products.filter((p) => !isAccessory(p));
  const accessories = products.filter(isAccessory);
  const byZone = {};
  for (const p of products) (byZone[zoneForCategory(p.category)] ??= []).push(p);

  const counters = new Map();
  const next = (key, list) => {
    if (!list.length) return null;
    const i = counters.get(key) ?? 0;
    counters.set(key, i + 1);
    return list[i % list.length];
  };

  const poolFor = (f, kind) => {
    if (kind === 'accessory') return accessories;
    let base;
    if (f.pool === 'accessories') base = accessories;
    else if (f.pool === 'new') base = garments;
    else base = byZone[f.zone] ?? [];
    let list = base.filter((p) => (kind === 'fold' ? isFoldable(p) : !isAccessory(p)));
    // accessoarbord: övre nivån visar väskor i stället för vikta plagg
    if (f.pool === 'accessories') list = accessories;
    if (!list.length) list = kind === 'fold' ? garments.filter(isFoldable) : garments;
    // framåtvända plagg kräver en frilagd bild för att se riktiga ut
    // (aldrig ett modellfoto på en galge – utan frilagd bild står platsen tom)
    if (kind === 'faceout') list = list.filter((p) => p.tryOnImage);
    return list;
  };

  const out = { folds: [], faceouts: [], sides: [], accessories: [], outfits: {}, spots: {} };

  let curLevel = 0;
  const remember = (p, slot) => {
    if (!p || out.spots[p.id]) return;
    const level = curLevel;
    // Stå ~1,3 m framför produkten och titta mot den.
    const r = slot.rot || 0;
    const [x, , z] = slot.pos;
    out.spots[p.id] = { x: x + Math.sin(r) * 1.3, z: z + Math.cos(r) * 1.3, lookAt: [x, z], level };
  };

  for (const f of fixtures) {
    curLevel = f.level || 0;
    for (const slot of f.slots ?? []) {
      const key = `${f.pool || f.zone}:${slot.kind}`;
      if (slot.kind === 'mannequin') {
        const look = [];
        for (const type of slot.look) {
          const want = type === 'outer' ? ['outer'] : type === 'upper' ? ['upper'] : type === 'lower' ? ['lower'] : type === 'skirt' ? ['skirt'] : ['full'];
          const list = garments.filter((p) => want.includes(garmentClass(p)));
          const p = next(`mq:${type}`, list);
          if (!p) continue;
          look.push({
            type: garmentClass(p) === 'outer' && type === 'upper' ? 'outer' : type,
            productId: p.id,
            color: primaryHex(p),
            fabric: fabricKind(p),
            longSleeve: !/t-shirt|linne|top$/i.test(p.name),
            wide: /wide|vid|bootcut/i.test(p.name),
          });
          remember(p, slot);
        }
        // En kappa behöver något under sig.
        if (look.some((l) => l.type === 'outer') && !look.some((l) => l.type === 'upper')) {
          const top = next('mq:under', garments.filter((p) => garmentClass(p) === 'upper'));
          if (top) look.push({ type: 'upper', productId: top.id, color: primaryHex(top), longSleeve: true });
        }
        out.outfits[f.id] = look;
        continue;
      }
      if (slot.kind === 'side') {
        // Sidohängda plagg i "storleksserier" om 4–6 av samma produkt.
        const items = [];
        let p = null;
        let run = 0;
        for (let i = 0; i < slot.count; i++) {
          if (run <= 0) {
            p = next(key, poolFor(f, 'side'));
            run = 4 + ((i * 7) % 3);
            remember(p, slot);
          }
          items.push(p);
          run--;
        }
        out.sides.push({ slot, fixture: f, items });
        continue;
      }
      const p = next(`${key}:${slot.kind}`, poolFor(f, slot.kind));
      if (!p) continue;
      remember(p, slot);
      const entry = { slot, fixture: f, product: p };
      if (slot.kind === 'fold') {
        if (isAccessory(p)) out.accessories.push(entry);
        else out.folds.push(entry);
      } else if (slot.kind === 'faceout') out.faceouts.push(entry);
      else if (slot.kind === 'accessory') out.accessories.push(entry);
    }
  }
  return out;
}
