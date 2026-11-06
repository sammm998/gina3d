import { create } from 'zustand';
import { STAFF } from '../config/staff.js';

const WISHLIST_KEY = 'gt3d.wishlist.v1';
const CART_KEY = 'gt3d.cart.v1';

function loadCart() {
  try {
    const arr = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}
function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* privat läge – korgen gäller bara under besöket */
  }
}

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
  select: (selectedId) => set({ selectedId, wishlistOpen: false, cartOpen: false, chat: { ...get().chat, open: false } }),

  // --- önskelista (sparas lokalt i webbläsaren)
  wishlist: loadWishlist(),
  wishlistOpen: false,
  toggleWishlist: (id) => {
    const cur = get().wishlist;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    saveWishlist(next);
    set({ wishlist: next });
  },
  setWishlistOpen: (wishlistOpen) => set({ wishlistOpen, cartOpen: false }),

  // --- kundkorg (sparas lokalt i webbläsaren)
  cart: loadCart(), // [{ key, id, size, color }]
  cartOpen: false,
  addToCart: (id, size = null, color = null) => {
    const key = `${id}|${size ?? ''}|${color ?? ''}`;
    const cur = get().cart;
    if (cur.some((x) => x.key === key)) return false;
    const next = [...cur, { key, id, size, color }];
    saveCart(next);
    set({ cart: next });
    return true;
  },
  removeFromCart: (key) => {
    const next = get().cart.filter((x) => x.key !== key);
    saveCart(next);
    set({ cart: next });
  },
  setCartOpen: (cartOpen) => set({ cartOpen, wishlistOpen: false, selectedId: cartOpen ? null : get().selectedId }),

  // --- AR-provning (fromCart: visa kundkorgens plagg först och klä på dem direkt)
  tryOn: { open: false, productId: null, fromCart: false },
  openTryOn: (productId, fromCart = false) => set({ tryOn: { open: true, productId, fromCart }, pointerLocked: false }),
  closeTryOn: () => set({ tryOn: { open: false, productId: null, fromCart: false } }),
  /** Nav-id för en promenad till provrummet; provningen öppnas vid ankomst. */
  fittingNavId: 0,
  goToFittingRoom: () => {
    const id = get().navigateTo(-3.35, -6.35, [-3.35, -7.5], 0);
    set({ fittingNavId: id, cartOpen: false, selectedId: null });
  },

  // --- navigering
  pointerLocked: false,
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  /** Senaste förfrågan om att gå någonstans: { id, x, z, lookAt?: [x, z], level? } */
  nav: null,
  navigateTo: (x, z, lookAt = null, level = undefined) => {
    const id = ++navCounter;
    set({ nav: { id, x, z, lookAt, level } });
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

  // --- chatt med personalen
  chat: { open: false, staffId: null, items: [], history: [], pending: false, mode: null },
  openChat: (staffId) => {
    const cur = get().chat;
    if (cur.staffId === staffId && cur.items.length) {
      set({ chat: { ...cur, open: true }, pointerLocked: false, selectedId: null, cartOpen: false, wishlistOpen: false });
      return;
    }
    const staff = STAFF.find((s) => s.id === staffId) ?? STAFF[0];
    set({
      chat: { open: true, staffId: staff.id, items: [{ role: 'staff', text: staff.greeting, cards: [] }], history: [], pending: false, mode: null },
      pointerLocked: false, selectedId: null, cartOpen: false, wishlistOpen: false,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  closeChat: () => set({ chat: { ...get().chat, open: false } }),
  sendChat: async (text) => {
    const c = get().chat;
    if (c.pending || !text.trim()) return;
    const staff = STAFF.find((s) => s.id === c.staffId) ?? STAFF[0];
    set({ chat: { ...c, pending: true, items: [...c.items, { role: 'user', text, cards: [] }] } });
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, staff: staff.name, history: c.history }),
      });
      const data = await res.json().catch(() => ({}));
      const now = get().chat;
      const reply = res.ok ? data.reply : data.error || 'Chatten svarar inte just nu.';
      set({
        chat: {
          ...now,
          pending: false,
          mode: data.mode ?? now.mode,
          history: Array.isArray(data.history) ? data.history : now.history,
          items: [...now.items, { role: 'staff', text: reply, cards: data.cards ?? [] }],
        },
      });
    } catch {
      const now = get().chat;
      set({ chat: { ...now, pending: false, items: [...now.items, { role: 'staff', text: 'Jag når inte servern just nu – försök igen om en stund.', cards: [] }] } });
    }
  },

  toast: null,
  showToast: (text) => {
    set({ toast: { text, id: Date.now() } });
  },
}));
