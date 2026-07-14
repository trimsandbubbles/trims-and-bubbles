"use client";

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, Plus, Minus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/store/cart-context";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/config/store";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CartWidget({ className }: { className?: string }) {
  const { count, subtotalCents, lines, setQty, remove, open, setOpen } = useCart();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted",
          className,
        )}
      >
        <ShoppingBag className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-[10px] font-bold text-accent-solid-foreground">
            {count}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="text-lg">Your cart{count > 0 ? ` · ${count}` : ""}</SheetTitle>
          </SheetHeader>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Your cart is empty.</p>
              <Button render={<Link href="/store" onClick={() => setOpen(false)} />}>Browse the shop</Button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                <ul className="space-y-4">
                  {lines.map((line) => (
                    <li key={line.slug} className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary ring-1 ring-border">
                        {line.image && <Image src={line.image} alt="" fill className="object-cover" sizes="64px" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{line.name}</p>
                        <p className="text-sm text-muted-foreground">{formatCents(line.priceCents)}</p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="inline-flex items-center rounded-full border border-border">
                            <button
                              type="button"
                              onClick={() => setQty(line.slug, line.quantity - 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-l-full hover:bg-muted"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQty(line.slug, line.quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-r-full hover:bg-muted"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(line.slug)}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm font-bold">{formatCents(line.priceCents * line.quantity)}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <SheetFooter className="border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-extrabold">{formatCents(subtotalCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
                    ? "🎉 You've unlocked free shipping!"
                    : `Free shipping over ${formatCents(FREE_SHIPPING_THRESHOLD_CENTS)} — or pick up in-store free.`}
                </p>
                <Button size="lg" className="w-full" render={<Link href="/store/checkout" onClick={() => setOpen(false)} />}>
                  Checkout
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
