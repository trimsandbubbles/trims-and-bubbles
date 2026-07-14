import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentRowActions } from "@/components/admin/payment-actions";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "Payments | Admin" };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  BALANCE: "Balance",
  FULL: "Full payment",
  REFUND: "Refund",
};

export default async function AdminPaymentsPage() {
  // Explicit data-layer guard (not just the layout) so this page re-checks the
  // session on every navigation, and to know whether to show owner-only actions.
  const session = await requireStaffOrOwner();
  const isOwner = session.user.role === "owner";
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: { appointment: { include: { primaryService: true, pet: true, client: { include: { user: true } } } } },
  });

  const pendingCents = payments.filter((p) => p.status === "PENDING").reduce((sum, p) => sum + p.amountCents, 0);
  const paidCents = payments.filter((p) => p.status === "PAID" && p.type !== "REFUND").reduce((sum, p) => sum + p.amountCents, 0);

  const dateFmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
      <p className="mt-1 text-muted-foreground">All payments across every client and appointment.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="mt-1 text-xl font-semibold">{formatCents(paidCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Awaiting payment</p>
            <p className="mt-1 text-xl font-semibold">{formatCents(pendingCents)}</p>
          </CardContent>
        </Card>
      </div>

      {payments.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-12 text-center text-muted-foreground">No payments recorded yet.</CardContent>
        </Card>
      ) : (
        <>
          <p className="mt-6 text-xs text-muted-foreground sm:hidden">Swipe sideways to see more →</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border sm:mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{dateFmt.format(p.paidAt ?? p.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/clients/${p.appointment.clientId}`} className="text-primary underline underline-offset-4">
                        {p.appointment.client.user.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/appointments/${p.appointmentId}`} className="text-primary underline underline-offset-4">
                        {p.appointment.primaryService.name} · {p.appointment.pet.name}
                      </Link>
                    </TableCell>
                    <TableCell>{PAYMENT_TYPE_LABEL[p.type] ?? p.type}</TableCell>
                    <TableCell className="text-muted-foreground">{p.method === "CASH" ? "Cash" : p.method === "OTHER" ? "Other" : "Card"}</TableCell>
                    <TableCell>{formatCents(p.amountCents)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "PAID" ? "secondary" : p.status === "FAILED" ? "destructive" : "outline"}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PaymentRowActions paymentId={p.id} status={p.status} amountCents={p.amountCents} isOwner={isOwner} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
