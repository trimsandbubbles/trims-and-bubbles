import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getAllProductsForAdmin } from "@/lib/store-data";
import { ProductManager } from "@/components/admin/product-editor";

export const metadata: Metadata = { title: "Shop products | Admin" };

export default async function AdminProductsPage() {
  // Pricing/availability are owner-critical — match the services editor guard.
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const products = await getAllProductsForAdmin();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Shop products</h1>
      <p className="mt-1 text-muted-foreground">
        Add, edit, reprice or sell out anything in your online shop — changes go live right away.
      </p>

      <ProductManager
        products={products.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          tagline: p.tagline,
          description: p.description,
          priceCents: p.priceCents,
          compareAtCents: p.compareAtCents,
          imageUrl: p.imageUrl,
          category: p.category,
          badge: p.badge,
          active: p.active,
          soldOut: p.soldOut,
          displayOrder: p.displayOrder,
        }))}
      />
    </div>
  );
}
