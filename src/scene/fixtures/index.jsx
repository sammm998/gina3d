import { FIXTURES } from '../../config/fixtures.js';
import { CashDesk, Platform, Podium, RoundPlatform, Shelf, Table } from './Furniture.jsx';
import { FreeRail, WallBay } from './Rails.jsx';
import { DigitalScreen, FittingRooms, FramedPhoto, Plant, TryOnMirror, WallLogo, WallText } from './Decor.jsx';
import Mannequin from './Mannequin.jsx';
import ModelOrFallback from '../ModelOrFallback.jsx';
import { MODELS } from '../../config/storeConfig.js';

/**
 * Mappning typ -> komponent. Lägg till en ny möbeltyp genom att skriva en
 * komponent som tar emot { f } och registrera den här.
 */
export const FIXTURE_COMPONENTS = {
  podium: Podium,
  table: Table,
  platform: Platform,
  roundPlatform: RoundPlatform,
  shelf: Shelf,
  cashDesk: CashDesk,
  wallBay: WallBay,
  freeRail: FreeRail,
  screen: DigitalScreen,
  plant: Plant,
  photo: FramedPhoto,
  wallText: WallText,
  wallLogo: WallLogo,
  fittingRooms: FittingRooms,
  tryOnMirror: TryOnMirror,
};

/** Möbeltyper som kan ersättas med en .glb via MODELS i storeConfig.js. */
const GLB_KEYS = { mannequin: 'mannequin', plant: 'plant', podium: 'podium', screen: 'screen' };

export default function Fixtures({ outfits = {}, eventsFor }) {
  return (
    <group>
      {FIXTURES.map((f) => {
        const glb = GLB_KEYS[f.type] && MODELS[GLB_KEYS[f.type]];
        if (f.type === 'mannequin') {
          const fallback = <Mannequin f={f} outfit={outfits[f.id]} eventsFor={eventsFor} />;
          return glb ? <ModelOrFallback key={f.id} url={glb} f={f} fallback={fallback} /> : <group key={f.id}>{fallback}</group>;
        }
        const C = FIXTURE_COMPONENTS[f.type];
        if (!C) return null;
        const el = <C f={f} />;
        return glb ? <ModelOrFallback key={f.id} url={glb} f={f} fallback={el} /> : <group key={f.id}>{el}</group>;
      })}
    </group>
  );
}
