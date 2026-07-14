import type { Metadata } from "next";
import Image from "next/image";
import { ImageOff, Store as StoreIcon, Truck } from "lucide-react";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/config/store";
import { getActiveProducts } from "@/lib/store-data";
import { formatCents } from "@/lib/format";
import { AddToCartButton } from "@/components/store/add-to-cart-button";

export const metadata: Metadata = {
  title: "Shop",
  description: "Treats, food, supplements and grooming essentials — pickup in-store or shipped to your door.",
};

export default async function StorePage() {
  const storeProducts = await getActiveProducts();

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="kicker justify-center">The shop</p>
          <h1 className="mt-5 text-4xl font-black text-balance sm:text-5xl">
            Treats, food &amp; grooming <span className="text-accent-solid">essentials</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Hand-picked products we use and trust on our own grooming table. Pick them up in-store, or have
            them shipped to your door.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              <StoreIcon className="h-4 w-4 text-accent-solid" /> Free in-store pickup
            </span>
            <span className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4 text-accent-solid" /> Free shipping over {formatCents(FREE_SHIPPING_THRESHOLD_CENTS)}
            </span>
          </div>
        </div>
      </section>

      {/* Product grid */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {storeProducts.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <StoreIcon className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-semibold">The shop is being stocked</p>
            <p className="mt-1 text-sm text-muted-foreground">
              New products are on their way — please check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {storeProducts.map((product) => (
              <div
                key={product.slug}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-accent-solid/5"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-secondary">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-10 w-10" />
                    </div>
                  )}
                  {product.soldOut && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <span className="rounded-full bg-foreground px-3 py-1 text-sm font-bold text-background">
                        Out of stock
                      </span>
                    </div>
                  )}
                  {/* Badge sits above the out-of-stock overlay (z-10) so a
                      "Coming in 2028" label still shows on sold-out items. */}
                  {product.badge && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-accent-solid px-2.5 py-1 text-xs font-bold text-accent-solid-foreground">
                      {product.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  {product.category && (
                    <p className="text-xs font-bold uppercase tracking-wide text-accent-solid">{product.category}</p>
                  )}
                  <h3 className="mt-1 text-lg font-extrabold leading-tight">{product.name}</h3>
                  {product.tagline && (
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">{product.tagline}</p>
                  )}
                  {product.description ? (
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-xl font-black">{formatCents(product.priceCents)}</span>
                    {product.compareAtCents && (
                      <span className="text-sm text-muted-foreground line-through">
                        {formatCents(product.compareAtCents)}
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    <AddToCartButton
                      product={{
                        slug: product.slug,
                        name: product.name,
                        priceCents: product.priceCents,
                        image: product.imageUrl,
                      }}
                      soldOut={product.soldOut}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
