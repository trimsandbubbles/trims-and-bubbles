"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { CartWidget } from "@/components/store/cart-widget";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services & Pricing" },
  { href: "/about", label: "About" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/store", label: "Shop" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-horizontal.svg" alt="Trims & Bubbles" className="h-11 w-auto" />
        </Link>

        <nav className="hidden xl:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "whitespace-nowrap px-2.5 py-2 text-sm rounded-md transition-colors hover:bg-muted hover:text-foreground",
                pathname === link.href ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <CartWidget />

          <div className="hidden xl:flex items-center gap-2">
            {session ? (
              <Button variant="outline" render={<Link href="/portal" />}>
                My Account
              </Button>
            ) : (
              <Button variant="ghost" render={<Link href="/login" />}>
                Log in
              </Button>
            )}
            <Button render={<Link href="/book" />}>Book Now</Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open menu" />}
          >
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="wordmark text-xl">
                <span className="text-accent-solid">Trims &amp;</span> <span className="text-foreground">Bubbles</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2.5 text-base",
                    pathname === link.href ? "bg-muted font-medium" : "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                {session ? (
                  <Button variant="outline" render={<Link href="/portal" onClick={() => setOpen(false)} />}>
                    My Account
                  </Button>
                ) : (
                  <Button variant="outline" render={<Link href="/login" onClick={() => setOpen(false)} />}>
                    Log in
                  </Button>
                )}
                <Button render={<Link href="/book" onClick={() => setOpen(false)} />}>Book Now</Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
        </div>
      </div>
    </header>
  );
}
