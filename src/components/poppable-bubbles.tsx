"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The site's ONE bubble layer 🫧 — colourful, gently floating, and (on
 * desktop) poppable. Deliberately a single layer above the content so no
 * bubble gets clipped behind a coloured band, and so every bubble you see is
 * the same interactive one.
 *
 * Performance & mobile first:
 * - Just ~26 bubbles total (down from ~85 across old layers).
 * - Motion is pure CSS `transform`/`opacity` (GPU-composited); honours
 *   `prefers-reduced-motion`.
 * - Interactivity is gated to hover-capable, fine-pointer devices via the
 *   `.bubble-pop-target` CSS rule — so on touch/mobile the bubbles are purely
 *   decorative and NEVER intercept a tap (buttons/forms are always reachable).
 * - The container is `pointer-events-none`; only non-popped bubbles opt in.
 *
 * Initial layout is deterministic (SSR-safe); respawns use Math.random, which
 * only runs client-side after a pop, so there's no hydration mismatch.
 */
const PALETTE = [
  "oklch(0.72 0.16 24)", // coral (brand)
  "oklch(0.76 0.15 355)", // pink
  "oklch(0.83 0.13 62)", // peach
  "oklch(0.87 0.14 96)", // butter yellow
  "oklch(0.81 0.12 165)", // mint
  "oklch(0.79 0.12 232)", // sky blue
  "oklch(0.77 0.13 305)", // lavender
];

type PB = {
  gen: number; // bumps on respawn → new React key → float animation restarts
  t: number;
  l: number;
  s: number;
  hue: string;
  dur: number;
  delay: number;
  drift: number;
  popped: boolean;
};

const COUNT = 26;

function seed(i: number, gen: number): PB {
  return {
    gen,
    // Even vertical spread down the page + a little jitter, scattered across.
    t: Math.round(((i + 0.5) / COUNT) * 92) + ((i * 17) % 6),
    l: ((i * 61 + 13) % 92) + 3,
    s: 26 + ((i * 5) % 6) * 12, // 26–86px
    hue: PALETTE[i % PALETTE.length],
    dur: 8 + (i % 5),
    delay: -((i * 1.7) % 8),
    drift: (i % 2 ? 1 : -1) * (8 + (i % 4) * 3),
    popped: false,
  };
}

function respawn(gen: number): PB {
  const r = Math.random;
  return {
    gen,
    t: 6 + r() * 88,
    l: 4 + r() * 90,
    s: 26 + Math.floor(r() * 60),
    hue: PALETTE[Math.floor(r() * PALETTE.length)],
    dur: 8 + r() * 5,
    delay: 0,
    drift: (r() < 0.5 ? -1 : 1) * (6 + r() * 14),
    popped: false,
  };
}

export function PoppableBubbles({ className }: { className?: string }) {
  const [bubbles, setBubbles] = useState<PB[]>(() =>
    Array.from({ length: COUNT }, (_, i) => seed(i, 0)),
  );

  const pop = useCallback((idx: number) => {
    setBubbles((prev) => {
      if (!prev[idx] || prev[idx].popped) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], popped: true };
      return next;
    });
    // After the pop animation, float a fresh bubble back in.
    window.setTimeout(() => {
      setBubbles((prev) => {
        const next = prev.slice();
        next[idx] = respawn((prev[idx]?.gen ?? 0) + 1);
        return next;
      });
    }, 430);
  }, []);

  return (
    <div aria-hidden className={cn("pointer-events-none overflow-hidden", className)}>
      {bubbles.map((b, i) => (
        <span
          key={`${i}-${b.gen}`}
          onPointerEnter={() => pop(i)}
          onPointerDown={() => pop(i)}
          className={cn("absolute rounded-full bubble", b.popped ? "bubble-pop" : "bubble-float bubble-pop-target")}
          style={
            {
              top: `${b.t}%`,
              left: `${b.l}%`,
              width: `${b.s}px`,
              height: `${b.s}px`,
              "--bub": b.hue,
              "--dur": `${b.dur}s`,
              "--delay": `${b.delay}s`,
              "--drift": `${b.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
