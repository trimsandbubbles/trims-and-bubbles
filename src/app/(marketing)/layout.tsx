import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PoppableBubbles } from "@/components/poppable-bubbles";
import { CartProvider } from "@/components/store/cart-context";
import { SiteContentProvider } from "@/components/site-content/edit-context";
import { EditToolbar } from "@/components/site-content/edit-toolbar";
import { getCurrentSession } from "@/lib/session";
import { getAllSiteContent } from "@/lib/site-content";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Reading the session here makes marketing pages render dynamically — fine
  // for this low-traffic site, and required so the owner sees edit affordances.
  const [session, content] = await Promise.all([getCurrentSession(), getAllSiteContent()]);
  const isOwner = session?.user.role === "owner";

  return (
    <SiteContentProvider content={content} isOwner={isOwner}>
      <div className="relative flex min-h-full min-w-0 flex-col">
        {/* The one bubble layer — colourful, floating, poppable on desktop.
            Above the content (so nothing clips it) but click-through
            (pointer-events-none container); only the bubbles opt into hover on
            desktop. Sits below the sticky header (z-40). */}
        <PoppableBubbles className="absolute inset-0 z-30" />
        <CartProvider>
          <SiteHeader />
          <main className="min-w-0 flex-1">{children}</main>
          <SiteFooter />
        </CartProvider>
      </div>
      <EditToolbar />
    </SiteContentProvider>
  );
}
