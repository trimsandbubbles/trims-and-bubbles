import type { Metadata } from "next";
import { Mail, User } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/portal/profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function PortalProfilePage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
      <p className="mt-1 text-muted-foreground">Your account details and preferences.</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" /> {session!.user.name}
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" /> {session!.user.email}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ProfileForm initialPhone={client?.phone ?? null} initialMarketingOptIn={client?.marketingOptIn ?? false} />
      </div>
    </div>
  );
}
