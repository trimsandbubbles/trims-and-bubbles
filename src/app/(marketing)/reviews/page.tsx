import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareHeart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EditableText } from "@/components/site-content/editable-text";
import { StarRating } from "@/components/reviews/star-rating";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Customer Reviews",
  description: "See what local dog owners say about Trims and Bubbles grooming.",
};

/** First name + last initial, e.g. "Sarah T." — never the full surname. */
function displayName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export default async function ReviewsPage() {
  const [reviews, session] = await Promise.all([
    prisma.review.findMany({
      where: { approved: true, hidden: false },
      orderBy: { createdAt: "desc" },
      include: { client: { include: { user: true } } },
    }),
    getCurrentSession(),
  ]);

  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const role = session?.user.role;
  const isClient = Boolean(session) && role !== "staff" && role !== "owner";

  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <EditableText contentKey="reviews.intro.heading" as="h1" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Customer Reviews
        </EditableText>
        <EditableText contentKey="reviews.intro.text" as="p" className="mx-auto mt-3 max-w-xl text-muted-foreground text-pretty">
          Kind words from the dog owners we&apos;ve had the joy of grooming for.
        </EditableText>

        {count > 0 && (
          <div className="mt-6 inline-flex flex-col items-center gap-1">
            <StarRating rating={average} sizeClassName="h-6 w-6" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{average.toFixed(1)}</span> out of 5 · {count} review
              {count === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>

      {/* Call to action — only clients can leave a review */}
      <div className="mt-8 flex justify-center">
        {isClient ? (
          <Button render={<Link href="/portal/reviews" />}>Write a review</Button>
        ) : session ? null : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Button render={<Link href="/login?next=/portal/reviews" />}>Log in to leave a review</Button>
            <p className="text-xs text-muted-foreground">
              New here?{" "}
              <Link href="/register" className="underline hover:text-foreground">
                Create an account
              </Link>{" "}
              — reviews come from real clients.
            </p>
          </div>
        )}
      </div>

      <div className="mt-12 space-y-4">
        {count === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <MessageSquareHeart className="h-8 w-8" />
              <EditableText contentKey="reviews.empty" as="p" className="text-pretty">
                No reviews just yet — check back soon, or be the first to leave one after your visit.
              </EditableText>
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="py-5">
                <div className="flex items-center justify-between gap-3">
                  <StarRating rating={review.rating} />
                  <span className="text-xs text-muted-foreground">{dateFmt.format(review.createdAt)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-pretty">{review.body}</p>
                <p className="mt-3 text-sm font-medium text-muted-foreground">— {displayName(review.client.user.name)}</p>

                {review.ownerReply && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs font-semibold text-primary">Reply from Trims &amp; Bubbles</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{review.ownerReply}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
