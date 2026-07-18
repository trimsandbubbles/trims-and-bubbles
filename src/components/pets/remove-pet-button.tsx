"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePet } from "@/lib/actions/pets";

/** "Remove dog" button reused by both the client portal and admin pet
 * profile page. `removePet` decides server-side whether that's a hard
 * delete or a soft archive (if the dog has grooming history). */
export function RemovePetButton({
  petId,
  petName,
  redirectTo,
}: {
  petId: string;
  petName: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Remove ${petName}? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await removePet({ petId });
      if (result.status === "success") {
        toast.success(`${petName} removed`);
        router.push(redirectTo);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button type="button" variant="destructive" onClick={handleClick} disabled={pending}>
      <Trash2 className="h-4 w-4" /> {pending ? "Removing..." : "Remove dog"}
    </Button>
  );
}
