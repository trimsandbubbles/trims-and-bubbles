"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessConfig } from "@/config/business";

/**
 * Catch-all fallback so an unexpected error never leaves a customer staring at a
 * blank screen. Kept deliberately plain-spoken: this site's visitors are pet
 * owners, not developers, and the salon is a one-person business — the most
 * useful thing we can offer is the phone number.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        Sorry about that — it&apos;s our end, not yours. Try again, and if it keeps happening please give us a
        call and we&apos;ll sort it out for you.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Button variant="outline" render={<Link href="/" />}>
          Back to home
        </Button>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        <a className="underline underline-offset-4" href={`tel:${businessConfig.contact.phone.replace(/\s/g, "")}`}>
          {businessConfig.contact.phone}
        </a>
        {" · "}
        <a className="underline underline-offset-4" href={`mailto:${businessConfig.contact.email}`}>
          {businessConfig.contact.email}
        </a>
      </p>
    </div>
  );
}
