import { create } from 'zustand';

const WISHLIST_KEY = 'gt3d.wishlist.v1';

function loadWishlist() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveWishlist(ids) {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids));
  } catch {
    /* privat läge e.d. – önskelistan gäller då bara under besöket */
  }
}

let navCounter = 0;

export const useStore = create((set, get) => ({
  // --- övergripande
  entered: false,
  enter: () => set({ entered: true }),
  isTouch: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches,

  /** Grafikkvalitet: 'high' (AO, bloom, golvreflexer), 'medium' (AO), 'low'. Sänks automatiskt vid låg fps. */
  quality: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'low' : 'high',
  setQuality: (quality) => set({ quality }),
  layoutVersion: 0,
  bumpLayout: () => set({ layoutVersion: get().layoutVersion + 1 }),

  // --- produkter
  products: [],
  productsById: {},
  productsError: null,
  setProducts: (products) =>
    set({ products, productsById: Object.fromEntries(products.map((p) => [p.id, p])) }),
  setProductsError: (productsError) => set({ productsError }),

  hovered: null, // { id, x, y }
  setHovered: (hovered) => set({ hovered }),
  selectedId: null,
  select: (selectedId) => set({ selectedId, wishlistOpen: false }),

  // --- önskelista (sparas lokalt i webbläsaren)
  wishlist: loadWishlist(),
  wishlistOpen: false,
  toggleWishlist: (id) => {
    const cur = get().wishlist;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    saveWishlist(next);
    set({ wishlist: next });
  },
  setWishlistOpen: (wishlistOpen) => set({ wishlistOpen }),

  // --- AR-provning
  tryOn: { open: false, productId: null },
  openTryOn: (productId) => set({ tryOn: { open: true, productId }, pointerLocked: false }),
  closeTryOn: () => set({ tryOn: { open: false, productId: null } }),

  // --- navigering
  pointerLocked: false,
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  /** Senaste förfrågan om att gå någonstans: { id, x, z, lookAt?: [x, z] } */
  nav: null,
  navigateTo: (x, z, lookAt = null) => {
    const id = ++navCounter;
    set({ nav: { id, x, z, lookAt } });
    return id;
  },
  cancelNav: () => set({ nav: null }),
  arrivedNavId: 0,
  notifyArrived: (id) => set({ arrivedNavId: id }),

  // --- guidad tur
  tour: { active: false, step: 0, caption: '' },
  setTour: (tour) => set({ tour: { ...get().tour, ...tour } }),

  // --- produktplacering (id -> världsposition där produkten visas)
  productSpots: {},
  setProductSpots: (productSpots) => set({ productSpots }),

  toast: null,
  showToast: (text) => {
    set({ toast: { text, id: Date.now() } });
  },
}));
