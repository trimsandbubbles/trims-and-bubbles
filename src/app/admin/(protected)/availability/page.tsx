import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AvailabilityEditor } from "@/components/admin/availability-editor";
import { ExceptionsEditor } from "@/components/admin/exceptions-editor";

export const metadata: Metadata = { title: "Availability | Admin" };

export default async function AdminAvailabilityPage() {
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany(),
    prisma.availabilityException.findMany({
      where: { date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
      <p className="mt-1 text-muted-foreground">Set your usual weekly hours, plus any one-off closures or custom days.</p>

      <div className="mt-6 space-y-6">
        <AvailabilityEditor initialRules={rules} />
        <ExceptionsEditor
          initialExceptions={exceptions.map((e) => ({
            id: e.id,
            date: e.date.toISOString().slice(0, 10),
            type: e.type,
            customStartTime: e.customStartTime,
            customEndTime: e.customEndTime,
            reason: e.reason,
          }))}
        />
      </div>
    </div>
  );
}
