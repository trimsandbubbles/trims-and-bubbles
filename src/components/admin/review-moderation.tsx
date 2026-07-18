"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/reviews/star-rating";
import { approveReview, setReviewHidden, deleteReview, replyToReview } from "@/lib/actions/reviews";

export type AdminReview = {
  id: string;
  rating: number;
  body: string;
  approved: boolean;
  hidden: boolean;
  ownerReply: string | null;
  clientName: string;
  dateLabel: string;
};

export function ReviewModerationCard({ review }: { review: AdminReview }) {
  const [reply, setReply] = useState(review.ownerReply ?? "");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ status: "success" } | { status: "error"; message: string }>, successMsg: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") toast.success(successMsg);
      else toast.error(result.message);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} />
            <span className="text-sm font-medium">{review.clientName}</span>
          </div>
          <span className="text-xs text-muted-foreground">{review.dateLabel}</span>
        </div>

        <p className="whitespace-pre-wrap text-sm text-pretty">{review.body}</p>

        <div className="flex flex-wrap gap-2">
          {!review.approved && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => approveReview({ reviewId: review.id }), "Review approved — it's now live")}
            >
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {review.approved && !review.hidden && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setReviewHidden({ reviewId: review.id, hidden: true }), "Review hidden from the website")}
            >
              <EyeOff className="h-4 w-4" /> Hide
            </Button>
          )}
          {review.hidden && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setReviewHidden({ reviewId: review.id, hidden: false }), "Review is visible again")}
            >
              <Eye className="h-4 w-4" /> Show again
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this review permanently? This can't be undone.")) {
                run(() => deleteReview({ reviewId: review.id }), "Review deleted");
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>

        <div className="border-t border-border pt-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Your public reply (optional — shown under the review)
          </label>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Thanks so much for the kind words! 🐾"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => replyToReview({ reviewId: review.id, reply }), "Reply saved")}
            >
              {review.ownerReply ? "Update reply" : "Add reply"}
            </Button>
            {review.ownerReply && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setReply("");
                  run(() => replyToReview({ reviewId: review.id, reply: "" }), "Reply removed");
                }}
              >
                Remove reply
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
