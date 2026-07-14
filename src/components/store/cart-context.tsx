"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * A cart line snapshots the product's name/price/image at add-time. The live
 * catalogue now lives in the DB (not a static config), and this client store
 * has no DB access — so we capture what we need to render the cart when the
 * shopper hits "Add to cart". This is display-only: `placeOrder` ALWAYS
 * re-resolves every line against the DB server-side, so a stale snapshot can
 * never set the real price a customer is charged.
 */
export type CartLine = {
  slug: string;
  name: string;
  priceCents: number;
  image: string | null;
  quantity: number;
};

/** The product fields the cart needs captured when something is added. */
export type CartProductInput = {
  slug: string;
  name: string;
  priceCents: number;
  image: string | null;
};

type CartContextValue = {
  lines: CartLine[];
  /** total number of items (sum of quantities) */
  count: number;
  subtotalCents: number;
  add: (product: CartProductInput, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  /** the cart slide-over open state, shared so "Add to cart" can pop it open */
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "tb_cart_v2";

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.priceCents === "number" &&
    typeof v.quantity === "number" &&
    v.quantity > 0 &&
    (v.image === null || typeof v.image === "string")
  );
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount. This MUST be an effect (not a lazy useState init):
  // the server has no localStorage, so initialising from storage would make
  // the server-rendered cart badge disagree with the client and throw a
  // hydration mismatch. Reading after mount keeps SSR = empty, then hydrates.
  useEffect(() => {
    let restored: CartLine[] | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          restored = parsed.filter(isCartLine);
        }
      }
    } catch {
      /* ignore malformed storage */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store (localStorage); see note above.
    if (restored) setLines(restored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [lines, hydrated]);

  const add = useCallback((product: CartProductInput, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.slug === product.slug);
      if (existing) {
        // Refresh the snapshot (price/name may have changed) and bump quantity.
        return prev.map((l) =>
          l.slug === product.slug
            ? { ...l, ...product, quantity: l.quantity + qty }
            : l,
        );
      }
      return [...prev, { ...product, quantity: qty }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((slug: string, qty: number) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.slug !== slug) : prev.map((l) => (l.slug === slug ? { ...l, quantity: qty } : l)),
    );
  }, []);

  const remove = useCallback((slug: string) => {
    setLines((prev) => prev.filter((l) => l.slug !== slug));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const { count, subtotalCents } = useMemo(() => {
    let count = 0;
    let subtotalCents = 0;
    for (const line of lines) {
      count += line.quantity;
      subtotalCents += line.priceCents * line.quantity;
    }
    return { count, subtotalCents };
  }, [lines]);

  const value = useMemo(
    () => ({ lines, count, subtotalCents, add, setQty, remove, clear, open, setOpen }),
    [lines, count, subtotalCents, add, setQty, remove, clear, open],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
