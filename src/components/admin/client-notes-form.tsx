"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/run-action";
import { updateClientInternalNotes } from "@/lib/actions/admin-clients";

export function ClientNotesForm({ clientId, initialNotes }: { clientId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await runAction(() => updateClientInternalNotes(clientId, notes), { success: "Notes saved" });
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        aria-label="Private client notes"
        placeholder="Private notes only staff can see — allergies, preferences, anything worth flagging next visit."
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={handleSave}>
        {pending ? "Saving..." : "Save notes"}
      </Button>
    </div>
  );
}
