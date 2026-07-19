import Link from "next/link";
import { Dog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/status-badge";

export interface BookingGroupSibling {
  id: string;
  petName: string;
  serviceName: string;
  startAt: Date;
  status: string;
}

/**
 * Small panel listing the other dogs that share the same bookingGroupId as
 * the appointment currently being viewed. Renders nothing if there are no
 * siblings to show.
 */
export function BookingGroupPanel({
  title,
  siblings,
  basePath,
  dateTimeFmt,
}: {
  title: string;
  siblings: BookingGroupSibling[];
  basePath: string;
  dateTimeFmt: Intl.DateTimeFormat;
}) {
  if (siblings.length === 0) return null;

  return (
    <div className="mt-5">
      <Card>
        <CardContent className="py-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium">
            <Dog className="h-4 w-4 text-primary" /> {title}
          </p>
          <ul className="space-y-2">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={`${basePath}/${s.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:border-accent-solid/50"
                >
                  <span>
                    <span className="font-medium">{s.petName}</span>
                    <span className="text-muted-foreground"> — {s.serviceName}</span>
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {dateTimeFmt.format(s.startAt)}
                    <AppointmentStatusBadge status={s.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
