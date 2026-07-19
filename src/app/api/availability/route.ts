import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSlotsWithStatusForDate, totalDurationMinutes } from "@/lib/availability-data";

/** A day is at most ~15h open; 24h is a safe hard cap on a requested block. */
const MAX_DURATION_MINUTES = 24 * 60;

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  // Preferred: the TOTAL duration to reserve (sum of every dog's service +
  // add-ons in a multi-dog booking). When present it's used directly.
  durationMinutes: z.coerce.number().int().positive().max(MAX_DURATION_MINUTES).optional(),
  // Fallback: a single service (+ add-ons) whose duration we look up.
  serviceId: z.string().optional(),
  addOnIds: z.string().optional(),
});

/**
 * Read-only slot lookup — deliberately a Route Handler rather than a Server
 * Action, since the booking wizard calls this repeatedly as the client clicks
 * around dates (Server Actions are dispatched sequentially per client and are
 * meant for mutations, not this kind of repeated read).
 *
 * Accepts either `durationMinutes` (the total block for a multi-dog booking)
 * or `serviceId`(+`addOnIds`) whose duration is looked up server-side.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    durationMinutes: searchParams.get("durationMinutes") ?? undefined,
    serviceId: searchParams.get("serviceId") ?? undefined,
    addOnIds: searchParams.get("addOnIds") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { date, durationMinutes, serviceId, addOnIds } = parsed.data;

  let duration: number;
  if (durationMinutes) {
    duration = durationMinutes;
  } else if (serviceId) {
    const addOnIdList = addOnIds ? addOnIds.split(",").filter(Boolean) : [];
    const [service, addOns] = await Promise.all([
      prisma.service.findUnique({ where: { id: serviceId } }),
      addOnIdList.length
        ? prisma.service.findMany({ where: { id: { in: addOnIdList }, active: true } })
        : Promise.resolve([]),
    ]);
    if (!service || !service.active) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }
    duration = totalDurationMinutes(
      service.durationMinutes,
      addOns.map((a) => a.durationMinutes),
    );
  } else {
    return NextResponse.json({ error: "Provide durationMinutes or serviceId" }, { status: 400 });
  }

  const { open, booked } = await getSlotsWithStatusForDate(date, duration);

  const toDTO = (s: { startAt: Date; endAt: Date }) => ({
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
  });

  return NextResponse.json({
    slots: open.map(toDTO),
    // Times lost to an existing booking/block — shown greyed-out ("Booked") so
    // clients can see why a time isn't offered. Bare start/end times only; no
    // client or pet details are ever exposed here.
    booked: booked.map(toDTO),
  });
}
