"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A table row that navigates to `href` when clicked (or on Enter/Space for
 * keyboard users). Purely a navigation convenience — it reads nothing and
 * writes nothing. Falls back to a plain, non-interactive row when no href is
 * given.
 */
export function LinkedTableRow({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  if (!href) return <TableRow className={className}>{children}</TableRow>;

  return (
    <TableRow
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className={cn("cursor-pointer transition-colors hover:bg-muted/60", className)}
    >
      {children}
    </TableRow>
  );
}
