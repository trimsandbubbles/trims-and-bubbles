"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/lib/run-action";
import { sendClientMessage } from "@/lib/actions/client-messages";

export function SendMessageForm({ clientId }: { clientId: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSend() {
    if (!body.trim()) {
      toast.error("Please write a message first.");
      return;
    }
    startTransition(async () => {
      await runAction(() => sendClientMessage({ clientId, subject: subject.trim() || undefined, body }), {
        success: "Message sent",
        onSuccess: () => {
          setSubject("");
          setBody("");
        },
      });
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (optional)"
        aria-label="Message subject (optional)"
        maxLength={150}
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Write a message to this client…"
        aria-label="Message to client"
        maxLength={5000}
      />
      <p className="text-xs text-muted-foreground">
        The client sees this in their account. Once email sending is switched on, it&apos;s also emailed to them.
      </p>
      <Button size="sm" disabled={pending} onClick={handleSend}>
        {pending ? "Sending..." : "Send message"}
      </Button>
    </div>
  );
}
