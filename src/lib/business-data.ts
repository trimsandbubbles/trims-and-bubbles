import { prisma } from "@/lib/prisma";
import { businessConfig } from "@/config/business";

/** Effective, publicly-displayable business details: owner-editable fields
 * (via /admin/settings) merged with the one-time launch defaults in
 * src/config/business.ts. A field only falls back to its config default when
 * the DB value is null or blank — so the live site never breaks before the
 * owner fills something in, and whatever she types simply overrides it. */
export type BusinessDetails = {
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  fullAddress: string;
  serviceAreaNote: string;
  credentialTitle: string;
  credentialInstitution: string;
  instagramUrl: string;
  facebookUrl: string;
  depositPercentage: number;
  bufferMinutes: number;
  // One-time setup, not owner-editable from Settings — always from config.
  legalName: string;
  tagline: string;
  hours: typeof businessConfig.defaultHours;
  timezone: string;
};

function withFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** Server-only: loads the BusinessSettings singleton (id=1), falling back to
 * an in-memory default when the row doesn't exist yet — mirrors
 * getBusinessSettings() in src/lib/services-data.ts. */
async function loadSettings() {
  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  return (
    settings ?? {
      id: 1,
      depositPercentage: 20,
      businessName: "Trims and Bubbles",
      contactPhone: null,
      contactEmail: null,
      socials: null,
      bufferMinutes: 15,
      fullAddress: null,
      serviceAreaNote: null,
      credentialTitle: null,
      credentialInstitution: null,
      instagramUrl: null,
      facebookUrl: null,
      updatedAt: new Date(),
    }
  );
}

/** The single source of truth for launch-detail content anywhere it's
 * displayed on the public site or pre-filled into the admin Settings form. */
export async function getBusinessDetails(): Promise<BusinessDetails> {
  const settings = await loadSettings();

  return {
    businessName: withFallback(settings.businessName, businessConfig.legalName),
    contactPhone: withFallback(settings.contactPhone, businessConfig.contact.phone),
    contactEmail: withFallback(settings.contactEmail, businessConfig.contact.email),
    fullAddress: withFallback(settings.fullAddress, businessConfig.location.fullAddress),
    serviceAreaNote: withFallback(settings.serviceAreaNote, businessConfig.location.serviceRadiusNote),
    credentialTitle: withFallback(settings.credentialTitle, businessConfig.credentials.certificateTitle),
    credentialInstitution: withFallback(settings.credentialInstitution, businessConfig.credentials.issuingInstitution),
    instagramUrl: withFallback(settings.instagramUrl, businessConfig.contact.instagram),
    facebookUrl: withFallback(settings.facebookUrl, businessConfig.contact.facebook),
    depositPercentage: settings.depositPercentage,
    bufferMinutes: settings.bufferMinutes,
    legalName: businessConfig.legalName,
    tagline: businessConfig.tagline,
    hours: businessConfig.defaultHours,
    timezone: businessConfig.timezone,
  };
}
