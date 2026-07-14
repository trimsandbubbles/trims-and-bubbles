import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getBusinessDetails } from "@/lib/business-data";
import { BusinessSettingsForm } from "@/components/admin/business-settings-form";

export const metadata: Metadata = { title: "Settings | Admin" };

export default async function AdminSettingsPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const settings = await getBusinessDetails();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-muted-foreground">Day-to-day business settings — changes apply immediately.</p>

      <div className="mt-6">
        <BusinessSettingsForm
          initial={{
            businessName: settings.businessName,
            contactPhone: settings.contactPhone,
            contactEmail: settings.contactEmail,
            depositPercentage: settings.depositPercentage,
            bufferMinutes: settings.bufferMinutes,
            fullAddress: settings.fullAddress,
            serviceAreaNote: settings.serviceAreaNote,
            credentialTitle: settings.credentialTitle,
            credentialInstitution: settings.credentialInstitution,
            instagramUrl: settings.instagramUrl,
            facebookUrl: settings.facebookUrl,
          }}
        />
      </div>
    </div>
  );
}
