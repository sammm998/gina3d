/**
 * Butikspersonalen. Modellerna är egna .glb-filer (assets/models/staff-*.glb,
 * skapade med `npm run models` – se tools/modelgen.js). Byt `model` mot en
 * annan riggad .glb med animationerna "Walk", "Idle" och "Talk" för andra
 * utseenden, t.ex. en fotorealistisk avatar.
 */
export const STAFF = [
  {
    id: 'emma', name: 'Emma', model: '/assets/models/staff-emma.glb', level: 0, zones: ['entrance', 'tops', 'denim'],
    greeting: 'Hej, jag heter Emma! Letar du efter något särskilt? Fråga mig om plagg, storlekar eller var du hittar saker.',
  },
  {
    id: 'ali', name: 'Ali', model: '/assets/models/staff-ali.glb', level: 0, zones: ['accessories', 'outerwear', 'checkout'],
    greeting: 'Hej, Ali här! Behöver du hjälp att hitta en jacka, en väska eller rätt storlek?',
  },
  {
    // står alltid i kassan på plan 1
    id: 'maja', name: 'Maja', model: '/assets/models/staff-maja.glb', level: 0, zones: ['checkout'],
    fixed: { x: -1.5, z: -6.85, yaw: 0 },
    greeting: 'Hej och välkommen till kassan! Jag hjälper dig gärna med kundkorgen, provrummet bredvid eller frågor om storlekar och returer.',
  },
  {
    id: 'sara', name: 'Sara', model: '/assets/models/staff-sara.glb', level: 1, zones: ['dresses', 'party'],
    greeting: 'Hej, jag är Sara! Ska du på fest eller söker du en vardagsklänning? Jag hjälper gärna till.',
  },
  {
    id: 'noah', name: 'Noah', model: '/assets/models/staff-noah.glb', level: 1, zones: ['party', 'dresses'],
    greeting: 'Hej, jag heter Noah! Letar du efter något till festen eller säsongens nyheter? Säg till så visar jag.',
  },
  {
    id: 'ella', name: 'Ella', model: '/assets/models/staff-ella.glb', level: 2, zones: ['trousers', 'knit'],
    greeting: 'Hej, Ella här! Jag kan hjälpa dig att hitta rätt passform på byxor eller en mysig stickad tröja.',
  },
  {
    id: 'linnea', name: 'Linnéa', model: '/assets/models/staff-linnea.glb', level: 2, zones: ['knit', 'trousers'],
    greeting: 'Hej, Linnéa här! Fråga mig gärna om stickat, byxor och passformer.',
  },
];

export const staffById = (id) => STAFF.find((s) => s.id === id);
