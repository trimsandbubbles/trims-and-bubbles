import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };

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

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  STRIPE: "Card",
  CASH: "Cash",
  OTHER: "Other",
};

export default async function PortalPaymentsPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  const payments = client
    ? await prisma.payment.findMany({
        where: { appointment: { clientId: client.id } },
        orderBy: { createdAt: "desc" },
        include: { appointment: { include: { primaryService: true, pet: true } } },
      })
    : [];

  const dateFmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Payments</h1>
      <p className="mt-1 text-muted-foreground">Your payment history across all appointments.</p>

      {payments.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CreditCard className="h-8 w-8" />
            <p>No payments recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mt-6 text-xs text-muted-foreground sm:hidden">Swipe sideways to see more →</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-border sm:mt-8">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Appointment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{dateFmt.format(p.paidAt ?? p.createdAt)}</TableCell>
                    <TableCell>
                      <Link href={`/portal/appointments/${p.appointmentId}`} className="text-primary underline underline-offset-4">
                        {p.appointment.primaryService.name} · {p.appointment.pet.name}
                      </Link>
                    </TableCell>
                    <TableCell>{PAYMENT_TYPE_LABEL[p.type] ?? p.type}</TableCell>
                    <TableCell className="text-muted-foreground">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</TableCell>
                    <TableCell>{formatCents(p.amountCents)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "PAID" ? "secondary" : p.status === "FAILED" ? "destructive" : "outline"}>
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
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
