import { useEffect, useMemo } from 'react';
import { FIXTURES } from '../config/fixtures.js';
import { useStore } from '../state/useStore.js';
import Fixtures from './fixtures/index.jsx';
import Products from './products/Products.jsx';
import { placeProducts } from './products/placement.js';
import { productEvents } from './products/events.js';
import Staff from './staff/Staff.jsx';
import RunwayShow from './staff/RunwayShow.jsx';
import OtherVisitors from './staff/OtherVisitors.jsx';

/** Inredning + produkter placerade automatiskt utifrån products.json. */
export default function StoreContent() {
  const products = useStore((s) => s.products);
  const placed = useMemo(() => placeProducts(products, FIXTURES), [products]);

  useEffect(() => {
    useStore.getState().setProductSpots(placed.spots);
    // Rendera om de bakade kontaktskuggorna när produkterna finns på plats.
    const id = setTimeout(() => useStore.getState().bumpLayout(), 300);
    return () => clearTimeout(id);
  }, [placed]);

  return (
    <group>
      <Fixtures outfits={placed.outfits} eventsFor={productEvents} />
      {products.length > 0 && <Products placed={placed} />}
      <Staff />
      <RunwayShow />
      <OtherVisitors />
    </group>
  );
}
