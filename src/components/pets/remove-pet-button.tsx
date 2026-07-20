"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { removePet } from "@/lib/actions/pets";
import { runAction } from "@/lib/run-action";

/** "Remove dog" button reused by both the client portal and admin pet
 * profile page. `removePet` decides server-side whether that's a hard
 * delete or a soft archive (if the dog has grooming history). */
export function RemovePetButton({
  petId,
  petName,
  redirectTo,
  size = "default",
  className,
}: {
  petId: string;
  petName: string;
  redirectTo: string;
  size?: "default" | "touch";
  className?: string;
}) {
  const router = useRouter();

  async function handleConfirm() {
    // `runAction` toasts on both success and failure and never throws, so
    // this component doesn't need its own try/catch or error toast.
    await runAction(() => removePet({ petId }), {
      success: `${petName} removed`,
      onSuccess: () => {
        router.push(redirectTo);
        router.refresh();
      },
    });
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="destructive" size={size === "touch" ? "touch" : "default"} className={className}>
          <Trash2 className="h-4 w-4" /> Remove dog
        </Button>
      }
      title={`Remove ${petName}?`}
      description={`This takes ${petName} off your list of dogs. Any past grooming history is kept, not deleted.`}
      confirmLabel={`Remove ${petName}`}
      cancelLabel={`Keep ${petName}`}
      variant="destructive"
      onConfirm={handleConfirm}
    />
  );
}
