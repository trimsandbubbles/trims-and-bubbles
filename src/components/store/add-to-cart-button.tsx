"use client";

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart, type CartProductInput } from "@/components/store/cart-context";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  product,
  soldOut = false,
  className,
}: {
  product: CartProductInput;
  soldOut?: boolean;
  className?: string;
}) {
  const { add } = useCart();

  if (soldOut) {
    return (
      <Button type="button" variant="outline" disabled className={cn("w-full", className)}>
        Sold out
      </Button>
    );
  }

  return (
    <Button type="button" onClick={() => add(product)} className={cn("w-full", className)}>
      <ShoppingBag className="h-4 w-4" /> Add to cart
    </Button>
  );
}
