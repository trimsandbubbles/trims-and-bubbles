import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { PortalHeader } from "@/components/portal/portal-header";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/portal");
  if (session.user.role === "staff" || session.user.role === "owner") redirect("/admin");

  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <PortalHeader userName={session.user.name} />
      <main className="min-w-0 flex-1 bg-muted/20">{children}</main>
    </div>
  );
}
