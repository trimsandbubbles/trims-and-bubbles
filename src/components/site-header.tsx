"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { CartWidget } from "@/components/store/cart-widget";
import { businessConfig } from "@/config/business";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services & Pricing" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/reviews", label: "Reviews" },
  { href: "/store", label: "Shop" },
  { href: "/contact", label: "Contact" },
];

const PHONE = businessConfig.contact.phone;
const PHONE_HREF = `tel:${PHONE.replace(/\s+/g, "")}`;

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* `shrink-0` + a right margin keeps the wordmark from butting straight
            into the first nav item at the 1024px breakpoint, where the bar is
            at its tightest. */}
        <Link href="/" className="mr-4 flex shrink-0 items-center xl:mr-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Trims & Bubbles" className="h-10 w-auto lg:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-horizontal.svg"
            alt="Trims & Bubbles"
            className="hidden h-11 w-auto lg:block"
          />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={`Call ${PHONE}`}
            render={<a href={PHONE_HREF} />}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            className="hidden lg:inline-flex"
            render={<a href={PHONE_HREF} aria-label={`Call ${PHONE}`} />}
          >
            <Phone className="h-4 w-4" />
            {PHONE}
          </Button>

          <CartWidget />

          <div className="hidden lg:flex items-center gap-2">
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

          <Button size="touch" className="lg:hidden" render={<Link href="/book" />}>
            Book Now
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}
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
