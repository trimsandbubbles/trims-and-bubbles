import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getBusinessDetails } from "@/lib/business-data";
import { SocialLinksForm } from "@/components/admin/social-links-form";

export const metadata: Metadata = { title: "Social media | Admin" };

export default async function AdminSocialPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const settings = await getBusinessDetails();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Social media</h1>
      <p className="mt-1 text-muted-foreground">Add your social pages — they show as icons in the site footer.</p>

      <div className="mt-6">
        <SocialLinksForm
          initial={{
            instagramUrl: settings.instagramUrl,
            facebookUrl: settings.facebookUrl,
            tiktokUrl: settings.tiktokUrl,
            youtubeUrl: settings.youtubeUrl,
          }}
        />
      </div>
    </div>
  );
}
