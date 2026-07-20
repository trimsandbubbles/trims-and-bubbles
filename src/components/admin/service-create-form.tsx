"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { createService } from "@/lib/actions/admin-services";
import { SIZE_BAND_HINTS, SIZE_BAND_LABELS } from "@/lib/format";

/** Dollars string (e.g. "28.50") -> integer cents. Blank/invalid -> 0. */
function dollarsToCents(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

const CORE_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;

/** Reveals an inline form to add a brand-new CORE service or ADD_ON. Its own
 * trigger button lives at the top of each group on the Services page. */
export function ServiceCreateForm({ category }: { category: "CORE" | "ADD_ON" }) {
  const isAddOn = category === "ADD_ON";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(isAddOn ? "15" : "60");
  // CORE: per-size dollar amounts.
  const [prices, setPrices] = useState<Record<string, string>>({ SMALL: "", MEDIUM: "", LARGE: "" });
  const [onInspection, setOnInspection] = useState(false);
  // ADD_ON: a single flat fee.
  const [fee, setFee] = useState("");

  const dirty =
    name.trim() !== "" ||
    description.trim() !== "" ||
    fee.trim() !== "" ||
    Object.values(prices).some((v) => v.trim() !== "");

  function reset() {
    setName("");
    setDescription("");
    setDurationMinutes(isAddOn ? "15" : "60");
    setPrices({ SMALL: "", MEDIUM: "", LARGE: "" });
    setOnInspection(false);
    setFee("");
  }

  function closeWithoutSaving() {
    reset();
    setOpen(false);
  }

  function handleSubmit() {
    const duration = Number(durationMinutes);
    if (!name.trim()) {
      toast.error("Give it a name");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error("How long does it take? Enter a positive number of minutes.");
      return;
    }

    const input = isAddOn
      ? {
          category: "ADD_ON" as const,
          name: name.trim(),
          description: description.trim() || undefined,
          durationMinutes: duration,
          priceCents: dollarsToCents(fee),
        }
      : {
          category: "CORE" as const,
          name: name.trim(),
          description: description.trim() || undefined,
          durationMinutes: duration,
          isOnInspection: onInspection,
          smallCents: dollarsToCents(prices.SMALL),
          mediumCents: dollarsToCents(prices.MEDIUM),
          largeCents: dollarsToCents(prices.LARGE),
        };

    startTransition(async () => {
      await runAction(() => createService(input), {
        onSuccess: (result) => {
          toast.success(result.message ?? `${name} added`);
          reset();
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="lg" className="h-11 px-6" onClick={() => setOpen(true)}>
        {isAddOn ? "Add an add-on" : "Add a service"}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 sm:p-6">
      <p className="text-sm font-medium">{isAddOn ? "New add-on" : "New service"}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`new-name-${category}`}>Name</Label>
          <Input
            id={`new-name-${category}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isAddOn ? "e.g. Cologne spritz" : "e.g. Full groom"}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`new-duration-${category}`}>How long does it take? (minutes)</Label>
          <Input
            id={`new-duration-${category}`}
            type="number"
            inputMode="numeric"
            min="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`new-desc-${category}`}>Description (optional)</Label>
        <Textarea
          id={`new-desc-${category}`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Pricing</p>

        {isAddOn ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">Flat fee</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
                className="h-11 w-24"
              />
            </div>
          </div>
        ) : (
          <>
            {CORE_SIZES.map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">
                  {SIZE_BAND_LABELS[size]}
                  <span className="block text-xs text-muted-foreground/80">{SIZE_BAND_HINTS[size]}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    disabled={onInspection}
                    value={prices[size]}
                    onChange={(e) => setPrices((prev) => ({ ...prev, [size]: e.target.value }))}
                    placeholder="0.00"
                    className="h-11 w-24"
                  />
                </div>
              </div>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={onInspection}
                onChange={(e) => setOnInspection(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              I&apos;ll quote this after meeting the dog
            </label>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={handleSubmit} disabled={pending} size="lg" className="h-11 px-6">
          {pending ? "Adding..." : isAddOn ? "Add add-on" : "Add service"}
        </Button>
        {dirty ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="lg" className="h-11 px-6" disabled={pending}>
                Cancel
              </Button>
            }
            title={`Discard this new ${isAddOn ? "add-on" : "service"}?`}
            description="What you've typed will be lost."
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            variant="destructive"
            onConfirm={closeWithoutSaving}
          />
        ) : (
          <Button variant="ghost" size="lg" className="h-11 px-6" disabled={pending} onClick={closeWithoutSaving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
