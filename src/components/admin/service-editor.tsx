"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { deleteService, removeServicePhoto, setServicePhoto, updateServiceAndPrices } from "@/lib/actions/admin-services";
import { SIZE_BAND_HINTS, SIZE_BAND_LABELS } from "@/lib/format";

export type ServicePriceRow = { id: string; sizeBand: "SMALL" | "MEDIUM" | "LARGE" | null; priceCents: number; isOnInspection: boolean };
export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  category: "CORE" | "ADD_ON";
  durationMinutes: number;
  active: boolean;
  imageUrl: string | null;
  prices: ServicePriceRow[];
};

export function ServiceEditor({ service }: { service: ServiceRow }) {
  const router = useRouter();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [active, setActive] = useState(service.active);
  const [prices, setPrices] = useState(service.prices);
  const [pending, startTransition] = useTransition();
  const [photoPending, startPhoto] = useTransition();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== service.name ||
    description !== (service.description ?? "") ||
    durationMinutes !== String(service.durationMinutes) ||
    active !== service.active ||
    JSON.stringify(prices) !== JSON.stringify(service.prices);

  function updatePrice(id: string, patch: Partial<ServicePriceRow>) {
    setPrices((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function handleRemoveConfirmed() {
    await runAction(() => deleteService(service.id), {
      onSuccess: (result) => toast.success(result.message ?? `${service.name} removed`),
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    startPhoto(async () => {
      await runAction(() => setServicePhoto(service.id, formData), {
        onSuccess: (result) => {
          toast.success(result.message ?? "Photo updated");
          router.refresh();
        },
      });
    });
  }

  async function handleRemovePhotoConfirmed() {
    await runAction(() => removeServicePhoto(service.id), {
      onSuccess: (result) => {
        toast.success(result.message ?? "Photo removed");
        router.refresh();
      },
    });
  }

  function handleSave() {
    const duration = Number(durationMinutes);
    if (!name.trim()) {
      toast.error("Give the service a name");
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      toast.error("Duration must be a positive number of minutes");
      return;
    }
    startTransition(async () => {
      await runAction(
        () =>
          updateServiceAndPrices({
            serviceId: service.id,
            name: name.trim(),
            description: description.trim() || undefined,
            durationMinutes: duration,
            active,
            prices: prices.map((p) => ({ id: p.id, priceCents: p.priceCents, isOnInspection: p.isOnInspection })),
          }),
        { success: `${name} saved` },
      );
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={active} onCheckedChange={setActive} />
          <span className="text-sm font-medium">{active ? "Active" : "Hidden from booking"}</span>
        </label>
        <Badge variant="outline">{service.category === "CORE" ? "Core service" : "Add-on"}</Badge>
      </div>
      {active !== service.active && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {active
            ? "Will become bookable again once you press Save."
            : "Won't show on the booking form once you press Save — existing bookings are unaffected."}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${service.id}`}>Name</Label>
          <Input id={`name-${service.id}`} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`duration-${service.id}`}>How long does it take? (minutes)</Label>
          <Input
            id={`duration-${service.id}`}
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
        <Label htmlFor={`desc-${service.id}`}>Description</Label>
        <Textarea id={`desc-${service.id}`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Service photo</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {service.imageUrl ? (
              <Image src={service.imageUrl} alt={`${service.name} photo`} fill className="object-cover" sizes="112px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImagePlus className="h-6 w-6" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoPending}
            >
              {photoPending ? "Uploading..." : service.imageUrl ? "Change photo" : "Add photo"}
            </Button>
            {service.imageUrl && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="lg" className="h-11" disabled={photoPending}>
                    <Trash2 className="h-4 w-4" /> Remove photo
                  </Button>
                }
                title={`Remove ${service.name}'s photo?`}
                description="The default photo will be used on your public Services page instead."
                confirmLabel="Remove photo"
                cancelLabel="Keep photo"
                variant="destructive"
                onConfirm={handleRemovePhotoConfirmed}
              />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Shown on your public Services page and home page. If you don&apos;t add one, a default photo is used.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium">Pricing</p>
        {prices.map((price) => (
          <div key={price.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">
              {price.sizeBand ? SIZE_BAND_LABELS[price.sizeBand] : "Flat fee"}
              {price.sizeBand && (
                <span className="block text-xs text-muted-foreground/80">{SIZE_BAND_HINTS[price.sizeBand]}</span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={price.isOnInspection}
                value={(price.priceCents / 100).toFixed(2)}
                onChange={(e) => updatePrice(price.id, { priceCents: Math.round(Number(e.target.value) * 100) })}
                className="h-11 w-24"
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={price.isOnInspection}
                onChange={(e) => updatePrice(price.id, { isOnInspection: e.target.checked })}
                className="h-4 w-4 rounded border-input"
              />
              I&apos;ll quote this after meeting the dog
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={!dirty || pending} size="lg" className="h-11 px-6">
          {pending ? "Saving..." : "Save"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="lg" className="h-11 px-6">
              Remove
            </Button>
          }
          title={`Remove "${service.name}"?`}
          description="If it has booking history it'll be hidden from the booking form instead of deleted."
          confirmLabel="Remove service"
          cancelLabel="Keep service"
          variant="destructive"
          onConfirm={handleRemoveConfirmed}
        />
      </div>
    </div>
  );
}
