"use client";

import { useRef, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSiteContent } from "@/components/site-content/edit-context";
import { updateSiteImage } from "@/lib/actions/site-content";

export function EditableImage({
  contentKey,
  fallbackSrc,
  alt,
  className,
  fill,
  width,
  height,
  sizes,
  priority,
}: {
  contentKey: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
}) {
  const { content, isOwner, editMode, setLocal } = useSiteContent();
  const src = content[contentKey] ?? fallbackSrc;

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const editing = isOwner && editMode;

  // Shared renderer for the underlying visual (real image or placeholder box).
  function renderVisual() {
    if (src) {
      return (
        <Image
          src={src}
          alt={alt}
          className={className}
          {...(fill
            ? { fill: true }
            : { width: width ?? 0, height: height ?? 0 })}
          sizes={sizes}
          priority={priority}
        />
      );
    }
    // No src and no fallback: neutral placeholder that keeps layout stable by
    // reusing the same sizing className. In edit mode it actively invites a
    // photo rather than just saying "coming soon".
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 border border-border bg-muted text-center text-muted-foreground",
          className,
        )}
        style={fill ? undefined : { width, height }}
      >
        <ImageIcon aria-hidden className="h-6 w-6 opacity-70" />
        <span className="px-2 text-xs">{editing ? "Tap to add a photo" : "Photo coming soon"}</span>
      </div>
    );
  }

  if (!editing) {
    return renderVisual();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    const formData = new FormData();
    formData.append("photo", file);

    startTransition(async () => {
      try {
        const result = await updateSiteImage(contentKey, formData);
        if (result.status === "success") {
          setLocal(contentKey, result.url);
          toast.success("Photo updated");
        } else {
          toast.error(result.message);
        }
      } catch {
        // Network drop, expired login, etc. The existing photo is untouched.
        toast.error("Couldn't upload that photo — check your connection and try again.");
      }
    });
  }

  const actionLabel = src ? "Change photo" : "Add photo";

  // Edit mode: overlay a persistent, always-visible "Change/Add photo"
  // affordance. It must NOT rely on hover — phones have no hover, so the pill
  // stays visible and the dashed outline signals the whole image is editable.
  return (
    <span className={cn("group/img relative inline-block", fill && "block h-full w-full")}>
      {renderVisual()}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileSelected}
        disabled={pending}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="absolute inset-0 z-10 flex min-h-11 items-center justify-center rounded-[inherit] bg-background/25 outline-1 outline-dashed outline-ring/60 transition-colors hover:bg-background/45 focus-visible:bg-background/45 focus-visible:outline-ring focus-visible:outline-2 disabled:cursor-not-allowed"
        aria-label={actionLabel}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-sm font-semibold text-card-foreground shadow-md">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> {actionLabel}
            </>
          )}
        </span>
      </button>
    </span>
  );
}
