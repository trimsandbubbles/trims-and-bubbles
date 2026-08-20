"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runAction } from "@/lib/run-action";
import { updateSocialLinks } from "@/lib/actions/admin-social";

export function SocialLinksForm({
  initial,
}: {
  initial: {
    instagramUrl: string | null;
    facebookUrl: string | null;
    tiktokUrl: string | null;
    youtubeUrl: string | null;
  };
}) {
  const [instagramUrl, setInstagramUrl] = useState(initial.instagramUrl ?? "");
  const [facebookUrl, setFacebookUrl] = useState(initial.facebookUrl ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(initial.tiktokUrl ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initial.youtubeUrl ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await runAction(
        () =>
          updateSocialLinks({
            instagramUrl: instagramUrl || undefined,
            facebookUrl: facebookUrl || undefined,
            tiktokUrl: tiktokUrl || undefined,
            youtubeUrl: youtubeUrl || undefined,
          }),
        { success: "Social links saved" },
      );
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">
        These show as little icons in your website footer. Leave any of them blank to hide that icon. Paste the full link,
        e.g. https://instagram.com/yourpage.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="instagram-url">Instagram link (optional)</Label>
          <Input
            id="instagram-url"
            type="url"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/yourpage"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="facebook-url">Facebook link (optional)</Label>
          <Input
            id="facebook-url"
            type="url"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/yourpage"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tiktok-url">TikTok link (optional)</Label>
          <Input
            id="tiktok-url"
            type="url"
            value={tiktokUrl}
            onChange={(e) => setTiktokUrl(e.target.value)}
            placeholder="https://tiktok.com/@yourpage"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="youtube-url">YouTube link (optional)</Label>
          <Input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://youtube.com/@yourpage"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save social links"}
      </Button>
    </form>
  );
}
