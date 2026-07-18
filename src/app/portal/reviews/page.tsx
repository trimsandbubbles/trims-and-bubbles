import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ReviewForm } from "@/components/reviews/review-form";
import { StarRating } from "@/components/reviews/star-rating";

export const metadata: Metadata = { title: "Leave a Review" };

export default async function PortalReviewPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });
  const review = client ? await prisma.review.findUnique({ where: { clientId: client.id } }) : null;
  const isLive = review?.approved && !review.hidden;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {review ? "Your review" : "Leave a review"}
      </h1>
      <p className="mt-1 text-muted-foreground">
        Tell us how your groom went — your review helps other dog owners find us.
      </p>

      {review && (
        <Card className={isLive ? "mt-6 border-primary/40 bg-primary/5" : "mt-6 border-amber-500/40 bg-amber-500/5"}>
          <CardContent className="flex items-start gap-3 py-4">
            {isLive ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            ) : (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="text-sm">
              <p className="font-medium">
                {isLive ? "Your review is live on our website. Thank you!" : "Thanks! Your review is waiting to be approved."}
              </p>
              <p className="mt-1 text-muted-foreground">
                {isLive ? (
                  <>
                    You can update it below anytime — edits are checked again before they go live.{" "}
                    <Link href="/reviews" className="underline hover:text-foreground">
                      See it on the reviews page
                    </Link>
                    .
                  </>
                ) : (
                  "It will appear on our public reviews page once the team approves it."
                )}
              </p>
              <div className="mt-3">
                <StarRating rating={review.rating} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardContent className="py-6">
          <ReviewForm initial={review ? { rating: review.rating, body: review.body } : null} />
        </CardContent>
      </Card>
    </div>
  );
}
