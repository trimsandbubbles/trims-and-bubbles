import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A "Leave a Google review" button. Render only when the owner has set a
 * Google review link in Settings (callers guard on that). */
export function GoogleReviewButton({
  url,
  variant = "default",
  className,
}: {
  url: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <Button variant={variant} className={className} render={<Link href={url} target="_blank" rel="noopener noreferrer" />}>
      <Star className="h-4 w-4" /> Leave a Google review
    </Button>
  );
}
