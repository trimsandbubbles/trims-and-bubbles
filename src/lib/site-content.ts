import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reads every SiteContent row and returns a flat `{ [key]: value }` map.
 *
 * This is the single read path for the owner-editable text/image overrides.
 * Pages provide their own hard-coded defaults; a key that has no row simply
 * won't appear in this map, and the component falls back to its default.
 */
export async function getAllSiteContent(): Promise<Record<string, string>> {
  const rows = await prisma.siteContent.findMany({
    select: { key: true, value: true },
  });

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}
