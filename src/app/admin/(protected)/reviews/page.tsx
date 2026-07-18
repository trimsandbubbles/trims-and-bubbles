import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ReviewModerationCard, type AdminReview } from "@/components/admin/review-moderation";

export const metadata: Metadata = { title: "Reviews | Admin" };

export default async function AdminReviewsPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner") redirect("/admin");

  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: { include: { user: true } } },
  });

  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const toAdmin = (r: (typeof reviews)[number]): AdminReview => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    approved: r.approved,
    hidden: r.hidden,
    ownerReply: r.ownerReply,
    clientName: r.client.user.name,
    displayName: r.displayName,
    photoUrls: r.photoUrls,
    dateLabel: dateFmt.format(r.createdAt),
  });

  const pending = reviews.filter((r) => !r.approved && !r.hidden).map(toAdmin);
  const live = reviews.filter((r) => r.approved && !r.hidden).map(toAdmin);
  const hidden = reviews.filter((r) => r.hidden).map(toAdmin);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
      <p className="mt-1 text-muted-foreground">
        Approve reviews to show them on your public reviews page. You can hide or delete any review, and reply to it.
      </p>

      {reviews.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
          <Star className="h-7 w-7" />
          <p>No reviews yet. They&apos;ll show up here as clients leave them.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600">
              Waiting for approval ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting — you&apos;re all caught up.</p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <ReviewModerationCard key={r.id} review={r} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
              Live on the website ({live.length})
            </h2>
            {live.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {live.map((r) => (
                  <ReviewModerationCard key={r.id} review={r} />
                ))}
              </div>
            )}
          </section>

          {hidden.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Hidden ({hidden.length})
              </h2>
              <div className="space-y-4">
                {hidden.map((r) => (
                  <ReviewModerationCard key={r.id} review={r} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
