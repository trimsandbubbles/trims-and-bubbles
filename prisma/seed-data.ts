/**
 * Real business data shared by both seeds (dev `seed.ts` and
 * `scripts/seed-production.ts`): opening hours and the service menu that the
 * owner signed off on in the website review. Demo-only data (fake clients,
 * appointments, staff) lives ONLY in the dev seed and must never reach
 * production.
 */

export const dayConfigs = [
  { dayOfWeek: 0, isActive: true, startTime: "09:00", endTime: "17:00" }, // Sun - full day
  { dayOfWeek: 1, isActive: true, startTime: "16:00", endTime: "20:00" }, // Mon - evenings from 4pm
  { dayOfWeek: 2, isActive: false, startTime: "09:00", endTime: "17:00" }, // Tue - closed
  { dayOfWeek: 3, isActive: false, startTime: "09:00", endTime: "17:00" }, // Wed - closed
  { dayOfWeek: 4, isActive: true, startTime: "16:00", endTime: "20:00" }, // Thu - evenings from 4pm
  { dayOfWeek: 5, isActive: true, startTime: "16:00", endTime: "20:00" }, // Fri - evenings from 4pm
  { dayOfWeek: 6, isActive: true, startTime: "09:00", endTime: "17:00" }, // Sat - full day
];

export type PriceRow = {
  sizeBand: "SMALL" | "MEDIUM" | "LARGE" | "XL" | null;
  priceCents: number;
  isOnInspection?: boolean;
};

export type ServiceDef = {
  slug: string;
  name: string;
  description: string;
  category: "CORE" | "ADD_ON";
  durationMinutes: number;
  displayOrder: number;
  prices: PriceRow[];
};

export const serviceDefs: ServiceDef[] = [
  {
    slug: "full-groom",
    name: "Full Groom",
    description:
      "The full works: bath with a coat-appropriate shampoo, blow-dry, full body clip or scissor-finish to breed standard or your preferred style, nail trim, and ear clean. Best for curly, non-shedding coats — poodles, cavoodles, schnauzers, and other oodle-type crosses — that need regular clipping to stay mat-free.",
    category: "CORE",
    durationMinutes: 180,
    displayOrder: 1,
    prices: [
      { sizeBand: "SMALL", priceCents: 9500 },
      { sizeBand: "MEDIUM", priceCents: 11500 },
      { sizeBand: "LARGE", priceCents: 13500 },
    ],
  },
  {
    slug: "wash-and-dry",
    name: "Wash and Dry",
    description:
      "A thorough bath with conditioning treatment and a full hand blow-dry and brush-out — no clipping. A great in-between-groom refresh, or a standalone option for coats that don't need trimming.",
    category: "CORE",
    durationMinutes: 60,
    displayOrder: 2,
    prices: [
      { sizeBand: "SMALL", priceCents: 5500 },
      { sizeBand: "MEDIUM", priceCents: 7000 },
      { sizeBand: "LARGE", priceCents: 8500 },
    ],
  },
  {
    slug: "wash-and-tidy",
    name: "Wash and Tidy",
    description:
      "Bath and blow-dry plus a light tidy-up — face, feet, sanitary areas, and a light overall trim — without a full restyle. A good middle-ground for coats that just need the edges neatened.",
    category: "CORE",
    durationMinutes: 90,
    displayOrder: 3,
    prices: [
      { sizeBand: "SMALL", priceCents: 7000 },
      { sizeBand: "MEDIUM", priceCents: 8500 },
      { sizeBand: "LARGE", priceCents: 10500 },
    ],
  },
  {
    slug: "groom-out",
    name: "Groom Out",
    description:
      "Undercoat removal plus a light hygiene-area trim for longer, double-coated breeds — border collies, shepherds, retrievers, and husky-type dogs — that need de-bulking rather than a short clip.",
    category: "CORE",
    durationMinutes: 120,
    displayOrder: 4,
    prices: [
      { sizeBand: "SMALL", priceCents: 9000 },
      { sizeBand: "MEDIUM", priceCents: 10500 },
      { sizeBand: "LARGE", priceCents: 12500 },
    ],
  },
  {
    slug: "deshed",
    name: "Deshed",
    description:
      "A dedicated undercoat blow-out treatment to clear loose, dead hair at the root. Best for smooth or short double-coated shedders — kelpies, cattle dogs, labradors, and staffy-type breeds.",
    category: "CORE",
    durationMinutes: 120,
    displayOrder: 5,
    prices: [
      { sizeBand: "SMALL", priceCents: 6500 },
      { sizeBand: "MEDIUM", priceCents: 8000 },
      { sizeBand: "LARGE", priceCents: 10000 },
    ],
  },
  {
    slug: "nail-clipping-ear-cleaning",
    name: "Nail Clipping and Ear Cleaning",
    description: "A quick, no-bath top-up: nail trim and a gentle ear clean. Walk-ins welcome, any size.",
    category: "CORE",
    durationMinutes: 20,
    displayOrder: 6,
    prices: [{ sizeBand: null, priceCents: 2500 }],
  },
];
