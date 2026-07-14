"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateMyPhone, updateMarketingOptIn } from "@/lib/actions/profile";

export function ProfileForm({
  initialPhone,
  initialMarketingOptIn,
}: {
  initialPhone: string | null;
  initialMarketingOptIn: boolean;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(initialMarketingOptIn);
  const [savingPhone, startPhoneTransition] = useTransition();
  const [savingOptIn, startOptInTransition] = useTransition();

  function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    startPhoneTransition(async () => {
      const result = await updateMyPhone(phone);
      if (result.status === "success") {
        toast.success("Phone number updated");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleToggleOptIn(checked: boolean) {
    setMarketingOptIn(checked);
    startOptInTransition(async () => {
      const result = await updateMarketingOptIn(checked);
      if (result.status !== "success") {
        setMarketingOptIn(!checked);
        toast.error("Couldn't update that — please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSavePhone} className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Contact number</h2>
        <p className="mt-1 text-sm text-muted-foreground">Used to reach you about your bookings.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input id="profile-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button type="submit" disabled={savingPhone}>
            {savingPhone ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Marketing emails</h2>
            <p className="mt-1 text-sm text-muted-foreground">Occasional news and offers from Trims and Bubbles.</p>
          </div>
          <Switch checked={marketingOptIn} onCheckedChange={handleToggleOptIn} disabled={savingOptIn} />
        </div>
      </div>
    </div>
  );
}
