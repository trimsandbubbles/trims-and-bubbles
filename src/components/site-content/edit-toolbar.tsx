"use client";

import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/components/site-content/edit-context";

/**
 * Floating owner control that toggles page edit mode. Renders nothing for
 * anyone who isn't the owner, so public visitors never see it. Sits at z-50 —
 * above the bubble layer (z-30) and the sticky header (z-40). There is no
 * floating cart (the cart lives in the header), so this corner is clear.
 */
export function EditToolbar() {
  const { isOwner, editMode, setEditMode } = useSiteContent();

  if (!isOwner) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 print:hidden">
      {editMode ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card py-2 pr-2 pl-4 text-card-foreground shadow-lg">
          <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
            You&apos;re editing — changes save as you go
          </span>
          <span className="text-sm font-medium text-muted-foreground sm:hidden">Editing</span>
          <Button size="sm" onClick={() => setEditMode(false)} className="min-h-11 px-4">
            <Check className="h-4 w-4" /> Done
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          className="min-h-11 px-5 text-sm shadow-lg"
          onClick={() => setEditMode(true)}
        >
          <Pencil className="h-4 w-4" /> Edit page text &amp; photos
        </Button>
      )}
    </div>
  );
}
