"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, LayoutDashboard, LogOut, Menu, Settings, Users, Clock, Receipt, Tag, ShoppingBag, Package, Image as ImageIcon, Share2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/admin", label: "Today", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/availability", label: "Availability", icon: Clock },
  { href: "/admin/services", label: "Services", icon: Tag, ownerOnly: true },
  { href: "/admin/products", label: "Shop Products", icon: Package, ownerOnly: true },
  { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/admin/reviews", label: "Reviews", icon: Star, ownerOnly: true },
  { href: "/admin/payments", label: "Payments", icon: Receipt },
  { href: "/admin/orders", label: "Store Orders", icon: ShoppingBag },
  { href: "/admin/settings", label: "Settings", icon: Settings, ownerOnly: true },
  { href: "/admin/social", label: "Social media", icon: Share2, ownerOnly: true },
];

type NavLink = (typeof NAV_LINKS)[number];

// Hoisted to module scope (rather than defined inside AdminShell) so it isn't
// re-created as a new component identity on every render.
function AdminNavList({
  links,
  pathname,
  onNavigate,
}: {
  links: NavLink[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => {
        const Icon = link.icon;
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  userName,
  role,
  children,
}: {
  userName: string;
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = NAV_LINKS.filter((l) => !l.ownerOnly || role === "owner");

  async function handleSignOut() {
    await signOut();
    router.push("/admin/login");
  }

  return (
    <div className="flex min-h-full min-w-0">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
        <div className="mb-6 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-horizontal.svg" alt="Trims & Bubbles" className="h-9 w-auto" />
        </div>
        <AdminNavList links={links} pathname={pathname} />
        <div className="mt-4 border-t border-border pt-4">
          <p className="truncate px-1 text-xs text-muted-foreground">Signed in as {userName}</p>
          <Button variant="ghost" onClick={handleSignOut} className="mt-2 w-full justify-start px-1">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* min-w-0: without it, this flex-1 column refuses to shrink below the
          intrinsic width of wide descendants (e.g. the payments table), and
          the whole page ends up horizontally scrollable on mobile instead of
          just the table's own overflow-x-auto wrapper scrolling internally. */}
      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-horizontal.svg" alt="Trims & Bubbles" className="h-8 w-auto" />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col px-4">
                <AdminNavList links={links} pathname={pathname} onNavigate={() => setOpen(false)} />
                <div className="mt-4 border-t border-border pt-4">
                  <p className="truncate text-xs text-muted-foreground">Signed in as {userName}</p>
                  <Button variant="ghost" onClick={handleSignOut} className="mt-2 w-full justify-start px-0">
                    <LogOut className="h-4 w-4" /> Sign out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <main className="min-w-0 flex-1 bg-muted/20 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
