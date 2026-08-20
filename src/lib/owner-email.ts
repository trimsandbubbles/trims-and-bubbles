import "server-only";
import { getBusinessSettings } from "@/lib/services-data";
import { businessConfig } from "@/config/business";

/**
 * The owner's real inbox — where owner alerts are sent AND where customer
 * replies should land. Resolution order:
 *   BusinessSettings.contactEmail (owner-editable, DB singleton)
 *     ?? OWNER_NOTIFICATION_EMAIL   (env override)
 *     ?? businessConfig.contact.email (code default of last resort).
 *
 * Customer-facing emails are sent from the verified domain
 * (support@trimsandbubbles.com.au), which can send but isn't set up to receive —
 * so every customer email sets `replyTo` to this address to route replies to a
 * monitored inbox (the owner's Gmail).
 */
export function resolveOwnerEmail(settingsContactEmail?: string | null): string {
  return settingsContactEmail || process.env.OWNER_NOTIFICATION_EMAIL || businessConfig.contact.email;
}

/** Same as resolveOwnerEmail but loads the settings singleton for callers that
 * don't already have it. */
export async function getOwnerEmail(): Promise<string> {
  const settings = await getBusinessSettings();
  return resolveOwnerEmail(settings.contactEmail);
}
