"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { completeAppointmentWithPhoto } from "@/lib/actions/admin-appointments";

/** The core admin action, two taps: choose/take a photo (optional), jot a
 * note (optional), hit one button that saves both and marks the job done. */
export function CompleteAppointmentForm({ appointmentId, alreadyComplete }: { appointmentId: string; alreadyComplete: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    if (formRef.current) {
      const input = formRef.current.elements.namedItem("photo") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await completeAppointmentWithPhoto(formData);
      if (result.status === "success") {
        toast.success(alreadyComplete ? "Saved" : "Marked complete");
        clearPhoto();
        formRef.current?.reset();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <div>
        <Label htmlFor="photo-input">Photo</Label>
        <div className="mt-2">
          {preview ? (
            <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-border">
              <Image src={preview} alt="Selected photo preview" fill className="object-cover" sizes="160px" />
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="photo-input"
              className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Camera className="h-7 w-7" />
              <span className="text-xs font-medium">Take or choose photo</span>
            </label>
          )}
          <input
            id="photo-input"
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          {fileName && <p className="mt-1.5 text-xs text-muted-foreground">{fileName}</p>}
        </div>
      </div>

      {preview && (
        <div className="space-y-1.5">
          <Label htmlFor="caption">Photo caption (optional)</Label>
          <Textarea id="caption" name="caption" rows={1} placeholder="e.g. Fresh full groom" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="note">Groomer&apos;s note (optional)</Label>
        <Textarea id="note" name="note" rows={2} placeholder="Anything the client or next groomer should know" />
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving..." : alreadyComplete ? "Save" : "Save & Mark Complete"}
      </Button>
    </form>
  );
}
