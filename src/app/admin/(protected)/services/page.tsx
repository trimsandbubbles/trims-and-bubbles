import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ServiceEditor, type ServiceRow } from "@/components/admin/service-editor";
import { ServiceCreateForm } from "@/components/admin/service-create-form";

export const metadata: Metadata = { title: "Services | Admin" };

export default async function AdminServicesPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const services = await prisma.service.findMany({
    orderBy: { displayOrder: "asc" },
    include: { prices: { orderBy: [{ sizeBand: "asc" }] } },
  });

  // Narrow Prisma rows to the editor's shape. XL is being retired — drop any
  // stray XL price rows so the size union stays SMALL/MEDIUM/LARGE/null.
  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    durationMinutes: s.durationMinutes,
    active: s.active,
    imageUrl: s.imageUrl,
    prices: s.prices
      .filter((p) => p.sizeBand !== "XL")
      .map((p) => ({
        id: p.id,
        sizeBand: p.sizeBand as "SMALL" | "MEDIUM" | "LARGE" | null,
        priceCents: p.priceCents,
        isOnInspection: p.isOnInspection,
      })),
  }));

  const coreServices = rows.filter((s) => s.category === "CORE");
  const addOns = rows.filter((s) => s.category === "ADD_ON");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Services &amp; Pricing</h1>
      <p className="mt-1 text-muted-foreground">Edit what you charge — changes apply to new bookings right away.</p>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Services</h2>
          <ServiceCreateForm category="CORE" />
        </div>
        <div className="mt-4 space-y-5">
          {coreServices.map((service) => (
            <ServiceEditor key={service.id} service={service} />
          ))}
          {coreServices.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No services yet — add one (e.g. Full groom) and it&apos;ll appear in the booking form.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Add-ons</h2>
          <ServiceCreateForm category="ADD_ON" />
        </div>
        <div className="mt-4 space-y-5">
          {addOns.map((service) => (
            <ServiceEditor key={service.id} service={service} />
          ))}
          {addOns.length === 0 && (
            <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No add-ons yet — add one (e.g. Cologne spritz) and it&apos;ll appear in the booking form.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
