"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRatingInput } from "@/components/reviews/star-rating-input";
import { submitReview } from "@/lib/actions/reviews";

export function ReviewForm({ initial }: { initial: { rating: number; body: string } | null }) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (rating < 1) {
      toast.error("Please pick a star rating first.");
      return;
    }
    if (!body.trim()) {
      toast.error("Please write a short comment.");
      return;
    }
    startTransition(async () => {
      const result = await submitReview({ rating, body });
      if (result.status === "success") {
        toast.success(initial ? "Your review was updated — thank you!" : "Thank you for your review!");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium">Your rating</label>
        <StarRatingInput value={rating} onChange={setRating} disabled={pending} />
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
      <Button onClick={handleSubmit} disabled={pending}>
        {pending ? "Saving…" : initial ? "Update my review" : "Submit my review"}
      </Button>
    </div>
  );
}
