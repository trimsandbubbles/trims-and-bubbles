import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportCsvButton } from "@/components/admin/export-csv-button";
import { LinkedTableRow } from "@/components/admin/linked-table-row";

export const metadata: Metadata = { title: "Bookkeeping | Admin" };

/**
 * READ-ONLY financial records. Compiles every appointment, recorded payment and
 * store order automatically from existing data — it never writes or changes
 * anything. Safe to open as often as you like.
 */
export default async function BookkeepingPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const [appointments, orders, paymentsAgg] = await Promise.all([
    prisma.appointment.findMany({
      include: { client: { include: { user: true } }, pet: true, primaryService: true, addOns: { include: { service: true } } },
      orderBy: { startAt: "desc" },
    }),
    prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true }, _count: true }),
  ]);

  type Record = {
    date: Date;
    type: "Appointment" | "Store order";
    customer: string;
    description: string;
    amountCents: number;
    status: string;
    counts: boolean; // toward revenue (i.e. not cancelled)
    href: string; // where clicking the row opens the full details
  };

  const records: Record[] = [
    ...appointments.map((a): Record => ({
      date: a.startAt,
      type: "Appointment",
      customer: a.client.user.name,
      description: `${a.pet.name} — ${[a.primaryService.name, ...a.addOns.map((x) => x.service.name)].join(" + ")}`,
      amountCents: a.totalPriceCents,
      status: a.status,
      counts: a.status !== "CANCELLED" && a.status !== "NO_SHOW",
      href: `/admin/appointments/${a.id}`,
    })),
    ...orders.map((o): Record => ({
      date: o.createdAt,
      type: "Store order",
      customer: o.contactName,
      description: o.items.map((i) => `${i.name} ×${i.quantity}`).join(", ") || "Store order",
      amountCents: o.totalCents,
      status: o.status,
      counts: o.status !== "CANCELLED",
      href: `/admin/orders#order-${o.id}`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const dateFmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit" });
  const thisMonth = monthFmt.format(new Date());

  const allTimeCents = records.filter((r) => r.counts).reduce((s, r) => s + r.amountCents, 0);
  const thisMonthCents = records
    .filter((r) => r.counts && monthFmt.format(r.date) === thisMonth)
    .reduce((s, r) => s + r.amountCents, 0);
  const paymentsCollected = paymentsAgg._sum.amountCents ?? 0;

  // CSV: header + one row per record.
  const csvRows: (string | number)[][] = [
    ["Date", "Type", "Customer", "Description", "Amount", "Status"],
    ...records.map((r) => [dateFmt.format(r.date), r.type, r.customer, r.description, (r.amountCents / 100).toFixed(2), r.status]),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookkeeping</h1>
          <p className="mt-1 text-muted-foreground">
            Every appointment and store order, compiled automatically. Click any row to open its full details. View-only — nothing here changes your data.
          </p>
        </div>
        {records.length > 0 && <ExportCsvButton rows={csvRows} filename={`trims-and-bubbles-records-${thisMonth}.csv`} />}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="This month (booked)" value={formatCents(thisMonthCents)} />
        <SummaryTile label="All-time (booked)" value={formatCents(allTimeCents)} />
        <SummaryTile label="Payments recorded" value={formatCents(paymentsCollected)} sub={`${paymentsAgg._count} payment${paymentsAgg._count === 1 ? "" : "s"}`} />
        <SummaryTile label="Transactions" value={String(records.filter((r) => r.counts).length)} />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="min-w-48">Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No records yet — bookings and orders will appear here automatically.
                </TableCell>
              </TableRow>
            ) : (
              records.map((r, i) => (
                <LinkedTableRow key={i} href={r.href} className={r.counts ? "" : "text-muted-foreground/60"}>
                  <TableCell className="whitespace-nowrap">{dateFmt.format(r.date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{r.type}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.customer}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.counts ? formatCents(r.amountCents) : <span className="line-through">{formatCents(r.amountCents)}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.status.replace(/_/g, " ").toLowerCase()}</TableCell>
                </LinkedTableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        &ldquo;Booked&rdquo; totals exclude cancelled/no-show bookings (shown struck-through). &ldquo;Payments recorded&rdquo; is
        money you logged as collected on an appointment.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
