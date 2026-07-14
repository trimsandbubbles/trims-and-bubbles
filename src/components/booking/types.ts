export type SizeBand = "SMALL" | "MEDIUM" | "LARGE";

export type ServicePriceDTO = {
  sizeBand: SizeBand | null;
  priceCents: number;
  isOnInspection: boolean;
};

export type ServiceDTO = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  prices: ServicePriceDTO[];
};

export type PetDTO = {
  id: string;
  name: string;
  breed: string | null;
  sizeBand: SizeBand;
  photoUrl: string | null;
};
