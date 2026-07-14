"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/pets", label: "My Dogs" },
  { href: "/portal/appointments", label: "Appointments" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/portal/payments", label: "Payments" },
  { href: "/portal/profile", label: "Profile" },
  { href: "/store", label: "Shop" },
];

export function PortalHeader({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/portal" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-horizontal.svg" alt="Trims & Bubbles" className="h-10 w-auto" />
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-2 text-sm rounded-md transition-colors hover:bg-muted hover:text-foreground",
                pathname === link.href ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <span className="pr-1 text-sm text-muted-foreground">Hi, {userName.split(" ")[0]}</span>
          <Button render={<Link href="/book" />}>Book Now</Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}>
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Hi, {userName.split(" ")[0]}</SheetTitle>
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
                <Button render={<Link href="/book" onClick={() => setOpen(false)} />}>Book Now</Button>
                <Button variant="outline" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" /> Log out
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
