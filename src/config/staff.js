/**
 * Butikspersonalen. Modellerna (assets/models/staff-*.glb) är realistiska
 * människomodeller med rörelsefångade animationer från Microsoft Rocketbox
 * (MIT-licens), konverterade med `npm run staff-models`. Byt `model` mot en
 * annan riggad .glb med animationerna "Walk", "Idle" och "Talk" för andra utseenden.
 */
export const STAFF = [
  {
    id: 'emma', voice: 'coral', name: 'Emma', model: '/assets/models/staff-emma.glb', level: 0, zones: ['entrance', 'tops', 'denim'],
    greeting: 'Hej, jag heter Emma! Letar du efter något särskilt? Fråga mig om plagg, storlekar eller var du hittar saker.',
  },
  {
    id: 'mike', voice: 'ash', name: 'Mike', model: '/assets/models/staff-mike.glb', level: 0, zones: ['accessories', 'outerwear', 'checkout'],
    greeting: 'Hej, Mike här! Behöver du hjälp att hitta en jacka, en väska eller rätt storlek?',
  },
  {
    // står alltid i kassan på plan 1
    id: 'maja', voice: 'sage', name: 'Maja', model: '/assets/models/staff-maja.glb', level: 0, zones: ['checkout'],
    fixed: { x: -1.8, z: -8.22, yaw: 0 },
    greeting: 'Hej och välkommen till kassan! Jag hjälper dig gärna med kundkorgen, provrummet bredvid eller frågor om storlekar och returer.',
  },
  {
    id: 'sara', voice: 'shimmer', name: 'Sara', model: '/assets/models/staff-sara.glb', level: 1, zones: ['dresses', 'party'],
    greeting: 'Hej, jag är Sara! Ska du på fest eller söker du en vardagsklänning? Jag hjälper gärna till.',
  },
  {
    id: 'noah', voice: 'verse', name: 'Noah', model: '/assets/models/staff-noah.glb', level: 1, zones: ['party', 'dresses'],
    greeting: 'Hej, jag heter Noah! Letar du efter något till festen eller säsongens nyheter? Säg till så visar jag.',
  },
  {
    id: 'ella', voice: 'nova', name: 'Ella', model: '/assets/models/staff-ella.glb', level: 2, zones: ['trousers', 'knit'],
    greeting: 'Hej, Ella här! Jag kan hjälpa dig att hitta rätt passform på byxor eller en mysig stickad tröja.',
  },
  {
    id: 'linnea', voice: 'ballad', name: 'Linnéa', model: '/assets/models/staff-linnea.glb', level: 2, zones: ['knit', 'trousers'],
    greeting: 'Hej, Linnéa här! Fråga mig gärna om stickat, byxor och passformer.',
  },
];

/** Kunder som strosar runt och tittar på kläderna (går inte att chatta med). */
export const SHOPPERS = [
  { id: 'kund-1', shopper: true, model: '/assets/models/shopper-1.glb', level: 0, zones: ['entrance', 'tops', 'accessories', 'denim'] },
  { id: 'kund-2', shopper: true, model: '/assets/models/shopper-2.glb', level: 0, zones: ['denim', 'outerwear', 'tops'] },
  { id: 'kund-3', shopper: true, model: '/assets/models/shopper-3.glb', level: 1, zones: ['dresses', 'party'] },
  { id: 'kund-4', shopper: true, model: '/assets/models/shopper-4.glb', level: 2, zones: ['trousers', 'knit'] },
];

export const staffById = (id) => STAFF.find((s) => s.id === id);
