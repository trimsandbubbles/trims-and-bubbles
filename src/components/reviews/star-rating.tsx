import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only star display. Handles fractional ratings (e.g. an average of 4.6)
 * by overlaying a width-clipped row of filled stars over a row of empty ones,
 * so any value renders cleanly. Used on the public reviews page and each card.
 */
export function StarRating({
  rating,
  sizeClassName = "h-4 w-4",
  className,
}: {
  rating: number;
  sizeClassName?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  const pct = (clamped / 5) * 100;

  return (
    <div
      className={cn("relative inline-flex w-max", className)}
      role="img"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
    >
      <div className="flex text-muted-foreground/30">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn("shrink-0 fill-current", sizeClassName)} aria-hidden />
        ))}
      </div>
      <div className="absolute inset-0 flex overflow-hidden text-amber-500" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className={cn("shrink-0 fill-current", sizeClassName)} aria-hidden />
        ))}
      </div>
    </div>
  );
}
