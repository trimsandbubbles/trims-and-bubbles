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

/**
 * One dog within a multi-dog booking, as the wizard builds it and as
 * `createBooking` expects each entry of its `dogs` array. Either `petId`
 * (an existing saved dog) OR `newDog` (a quick-added dog — size required,
 * everything else optional) must be set. Each dog carries one or more services
 * and any add-ons.
 */
export type NewDogInput = {
  name?: string;
  breed?: string;
  sizeBand: SizeBand;
  coatType?: string;
};

export type BookingDogLine = {
  petId?: string;
  newDog?: NewDogInput;
  /** One or more chosen services for this dog (e.g. Wash & Dry + Nail Clipping).
   * The dog is dropped off once, so several services still take one slot. */
  serviceIds: string[];
  addOnServiceIds: string[];
};

/** The exact payload `createBooking` accepts (kept in sync with the zod schema
 * in src/lib/actions/booking.ts). */
export type CreateBookingPayload = {
  startAt: string; // ISO
  phone: string;
  notesFromClient?: string;
  pickupRequested: boolean;
  pickupAddress?: string;
  dogs: BookingDogLine[];
};
