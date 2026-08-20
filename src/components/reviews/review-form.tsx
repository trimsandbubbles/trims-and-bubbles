"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StarRatingInput } from "@/components/reviews/star-rating-input";
import { GoogleReviewButton } from "@/components/reviews/google-review-button";
import { runAction } from "@/lib/run-action";
import { submitReview } from "@/lib/actions/reviews";

const MAX_PHOTOS = 3;

type NewPhoto = { file: File; preview: string };

export function ReviewForm({
  initial,
  googleReviewUrl,
}: {
  initial: { rating: number; body: string; displayName: string; photoUrls: string[] } | null;
  googleReviewUrl?: string | null;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [keptPhotos, setKeptPhotos] = useState<string[]>(initial?.photoUrls ?? []);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const [posted, setPosted] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const totalPhotos = keptPhotos.length + newPhotos.length;

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - totalPhotos;
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const picked = files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setNewPhotos((prev) => [...prev, ...picked]);
    if (files.length > room) toast.error(`Only ${MAX_PHOTOS} photos allowed — some were skipped.`);
  }

  function removeKept(url: string) {
    setKeptPhotos((prev) => prev.filter((u) => u !== url));
  }
  function removeNew(preview: string) {
    setNewPhotos((prev) => {
      const found = prev.find((p) => p.preview === preview);
      if (found) URL.revokeObjectURL(found.preview);
      return prev.filter((p) => p.preview !== preview);
    });
  }

  function handleSubmit() {
    if (rating < 1) {
      toast.error("Please pick a star rating first.");
      return;
    }
    if (!body.trim()) {
      toast.error("Please write a short comment.");
      return;
    }
    const fd = new FormData();
    fd.set("rating", String(rating));
    fd.set("body", body);
    fd.set("displayName", displayName.trim());
    fd.set("keepUrls", JSON.stringify(keptPhotos));
    for (const p of newPhotos) fd.append("photos", p.file);

    startTransition(async () => {
      // runAction guarantees a toast even if submitReview THROWS (e.g. an expired
      // session), instead of the submit silently doing nothing.
      await runAction(() => submitReview(fd), {
        success: initial ? "Your review was updated — it's live now!" : "Your review is now live on our website!",
        onSuccess: (result) => {
          if (result.status !== "success") return;
          // Adopt the server's saved photo list and drop the local previews.
          newPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
          setNewPhotos([]);
          setKeptPhotos(result.photoUrls);
          setPosted(true);
          // Refresh so the "Your review is live" card (server-rendered) appears
          // straight away, even for a brand-new first review.
          router.refresh();
        },
      });
    });
  }

  return (
    <div className="space-y-5">
      {posted && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-2">
            <p>
              <span className="font-medium">Your review is live on our website</span> — it posts straight away, no
              approval needed.{" "}
              <Link href="/reviews" className="underline hover:text-foreground">
                See it on the reviews page
              </Link>
              .
            </p>
            {googleReviewUrl && (
              <p className="text-muted-foreground">
                Would you share it on Google too? It helps other local dog owners find us the most.
                <span className="mt-2 block">
                  <GoogleReviewButton url={googleReviewUrl} variant="outline" />
                </span>
              </p>
            )}
          </div>
        </div>
      )}
      <div>
        <label className="mb-2 block text-sm font-medium">Your rating</label>
        <StarRatingInput value={rating} onChange={setRating} disabled={pending} />
      </div>

      <div>
        <label htmlFor="review-name" className="mb-2 block text-sm font-medium">
          Name to show on your review
        </label>
        <Input
          id="review-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Sarah T. (leave blank to use your first name)"
        />
      </div>

      <div>
        <label htmlFor="review-body" className="mb-2 block text-sm font-medium">
          Your comment
        </label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Tell others about your experience with Trims & Bubbles…"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Photos <span className="font-normal text-muted-foreground">(optional — up to {MAX_PHOTOS})</span>
        </label>
        <div className="flex flex-wrap gap-3">
          {keptPhotos.map((url) => (
            <PhotoThumb key={url} src={url} onRemove={() => removeKept(url)} disabled={pending} />
          ))}
          {newPhotos.map((p) => (
            <PhotoThumb key={p.preview} src={p.preview} onRemove={() => removeNew(p.preview)} disabled={pending} />
          ))}
          {totalPhotos < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
              aria-label="Add a photo"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[11px]">Add</span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPickFiles}
          disabled={pending}
        />
      </div>

      <Button onClick={handleSubmit} disabled={pending}>
        {pending ? "Saving…" : initial ? "Update my review" : "Submit my review"}
      </Button>
    </div>
  );
}

function PhotoThumb({ src, onRemove, disabled }: { src: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Review photo" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove photo"
        className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-1 text-foreground shadow hover:bg-background disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
