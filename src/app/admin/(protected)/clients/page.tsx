import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ClientsTable, type ClientRow } from "@/components/admin/clients-table";

export const metadata: Metadata = { title: "Clients | Admin" };

export default async function AdminClientsPage() {
  const clients = await prisma.client.findMany({
    include: { user: true, _count: { select: { pets: true, appointments: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.user.name,
    email: c.user.email,
    phone: c.phone,
    petCount: c._count.pets,
    appointmentCount: c._count.appointments,
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
      <p className="mt-1 text-muted-foreground">
        {rows.length} client{rows.length === 1 ? "" : "s"}
      </p>
      <div className="mt-6">
        <ClientsTable clients={rows} />
      </div>
    </div>
  );
}
