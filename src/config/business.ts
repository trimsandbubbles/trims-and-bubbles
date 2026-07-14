/**
 * ⚠️ CLIENT ACTION REQUIRED before go-live.
 *
 * Everything marked TODO_CLIENT below is real launch content nobody but you
 * can supply — it's deliberately centralized here (instead of scattered
 * across page files) so it's easy to find and fill in. Nothing else in this
 * file needs to change for launch.
 *
 * Day-to-day operational settings (deposit %, hours, contact info the owner
 * might tweak often) live in the database via /admin/settings instead — see
 * BusinessSettings in prisma/schema.prisma. This file is one-time setup only.
 */
export const businessConfig = {
  legalName: "Trims & Bubbles",
  tagline: "Professional & luxury grooming for your beloved pet",

  location: {
    suburb: "Dunlop, ACT",
    region: "Dunlop, Canberra",
    fullAddress: "Hobday Place, Dunlop ACT",
    serviceRadiusNote: "Pickups and drop-offs available for a reasonable price",
  },

  // A qualified dog groomer whose 10+ years are in in-home dog boarding —
  // now extending that experience into washing, grooming and trimming.
  credentials: {
    hasCertificate: true,
    certificateTitle: "Qualified dog groomer",
    issuingInstitution: "",
    yearsExperience: "10+ years",
  },

  contact: {
    phone: "0423 464 314",
    email: "trimsandbubbles@gmail.com",
    instagram: "",
    facebook: "",
  },

  // Default bookable hours (client confirmed Tue-Sat 9am-5pm as the starting
  // default). Owner can change this anytime from /admin/availability — this
  // is only the seed value.
  defaultHours: [
    { day: "Monday", open: null, close: null },
    { day: "Tuesday", open: "09:00", close: "17:00" },
    { day: "Wednesday", open: "09:00", close: "17:00" },
    { day: "Thursday", open: "09:00", close: "17:00" },
    { day: "Friday", open: "09:00", close: "17:00" },
    { day: "Saturday", open: "09:00", close: "17:00" },
    { day: "Sunday", open: null, close: null },
  ],

  timezone: "Australia/Sydney",
  currency: "aud",
} as const;
