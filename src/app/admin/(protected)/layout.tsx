import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/admin/login?next=/admin");
  if (session.user.role !== "staff" && session.user.role !== "owner") redirect("/login");

  return (
    <AdminShell userName={session.user.name} role={session.user.role}>
      {children}
    </AdminShell>
  );
}
