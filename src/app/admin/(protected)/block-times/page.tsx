import type { Metadata } from "next";
import { requireStaffOrOwner } from "@/lib/session";
import { getBlockGridForRange } from "@/lib/availability-data";
import { BlockTimesGrid } from "@/components/admin/block-times-grid";

export const metadata: Metadata = { title: "Block times | Admin" };

// Always reflect the latest bookings/blocks (never a stale prerender).
export const dynamic = "force-dynamic";

const DAYS_AHEAD = 56; // ~2 months

export default async function BlockTimesPage() {
  await requireStaffOrOwner();

  const todaySydney = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const days = await getBlockGridForRange(todaySydney, DAYS_AHEAD);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Block off times</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Make individual slots unavailable — for a break, an appointment elsewhere, or a personal errand — without
        creating a fake booking. Tap an open slot to block it; tap a{" "}
        <span className="font-medium text-destructive">blocked</span> one to open it back up. Booked slots are locked.
        Changes take effect on the booking page straight away.
      </p>

      <BlockTimesGrid days={days} />
    </div>
  );
}
