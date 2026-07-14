import Link from "next/link";
import { Scissors } from "lucide-react";

export function AuthCard({
  title,
  description,
  children,
  footer,
  brandHref = "/",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  brandHref?: string;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-16">
      <Link href={brandHref} className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Scissors className="h-4.5 w-4.5" />
        </span>
        Trims and Bubbles
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground text-pretty">{description}</p>}
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
