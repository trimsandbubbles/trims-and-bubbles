"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Plus, Trash2, X, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { createProduct, updateProduct, deleteProduct } from "@/lib/actions/admin-products";

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  imageUrl: string | null;
  category: string | null;
  badge: string | null;
  active: boolean;
  soldOut: boolean;
  displayOrder: number;
};

function centsToDollars(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

/** Tidy up a hand-typed web address as soon as the owner leaves the field, so
 * she never hits a "letters, numbers and hyphens only" error later. */
function slugifyInput(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Top-level manager: an "Add product" affordance plus one editable card per
 * product. Mirrors the always-open ServiceEditor pattern the owner already
 * knows. */
export function ProductManager({ products }: { products: ProductRow[] }) {
  const [adding, setAdding] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);

  function closeAddForm() {
    setCreateDirty(false);
    setAdding(false);
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex justify-end">
        {adding ? (
          createDirty ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="lg" className="h-11 px-6">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              }
              title="Discard this new product?"
              description="What you've typed will be lost."
              confirmLabel="Discard"
              cancelLabel="Keep editing"
              variant="destructive"
              onConfirm={closeAddForm}
            />
          ) : (
            <Button type="button" variant="outline" size="lg" className="h-11 px-6" onClick={closeAddForm}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          )
        ) : (
          <Button type="button" variant="default" size="lg" className="h-11 px-6" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )}
      </div>

      {adding && (
        <ProductForm mode="create" onDone={closeAddForm} onDirtyChange={setCreateDirty} />
      )}

      {products.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <PackagePlus className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">Your shop is empty</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add your first product — a treat, food, supplement or grooming essential — and it&apos;ll appear in the
            shop straight away.
          </p>
          <Button type="button" size="lg" className="h-11 px-6" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add your first product
          </Button>
        </div>
      ) : (
        products.map((product) => <ProductForm key={product.id} mode="edit" product={product} />)
      )}
    </div>
  );
}

function ProductForm({
  mode,
  product,
  onDone,
  onDirtyChange,
}: {
  mode: "create" | "edit";
  product?: ProductRow;
  onDone?: () => void;
  /** create mode only: reports whether the owner has typed/chosen anything,
   * so the parent can confirm before discarding on an accidental Cancel tap. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [tagline, setTagline] = useState(product?.tagline ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(centsToDollars(product?.priceCents ?? null));
  const [compareAt, setCompareAt] = useState(centsToDollars(product?.compareAtCents ?? null));
  const [category, setCategory] = useState(product?.category ?? "");
  const [badge, setBadge] = useState(product?.badge ?? "");
  const [displayOrder, setDisplayOrder] = useState(String(product?.displayOrder ?? 0));
  const [active, setActive] = useState(product?.active ?? true);
  const [soldOut, setSoldOut] = useState(product?.soldOut ?? false);

  // Photo: existing url, a freshly-chosen preview, and a "remove existing" flag.
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const currentImage = removeImage ? null : product?.imageUrl ?? null;

  // create mode only: has the owner typed or chosen anything yet? Tells the
  // parent whether an accidental Cancel tap needs a confirmation first.
  const dirty =
    mode === "create" &&
    (name.trim() !== "" ||
      tagline.trim() !== "" ||
      description.trim() !== "" ||
      price.trim() !== "" ||
      compareAt.trim() !== "" ||
      category.trim() !== "" ||
      badge.trim() !== "" ||
      Boolean(preview));

  useEffect(() => {
    if (mode === "create") onDirtyChange?.(dirty);
  }, [dirty, mode, onDirtyChange]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    if (file) setRemoveImage(false);
  }

  function clearChosenPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function resetForm() {
    setName("");
    setSlug("");
    setTagline("");
    setDescription("");
    setPrice("");
    setCompareAt("");
    setCategory("");
    setBadge("");
    setDisplayOrder("0");
    setActive(true);
    setSoldOut(false);
    setRemoveImage(false);
    clearChosenPhoto();
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Give the product a name");
      return;
    }
    const priceNum = Number(price);
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Enter a valid price");
      return;
    }

    const fd = new FormData();
    if (product) fd.set("id", product.id);
    fd.set("name", name.trim());
    fd.set("slug", slug.trim());
    fd.set("tagline", tagline.trim());
    fd.set("description", description.trim());
    fd.set("price", price.trim());
    fd.set("compareAt", compareAt.trim());
    fd.set("category", category.trim());
    fd.set("badge", badge.trim());
    fd.set("displayOrder", displayOrder.trim() || "0");
    fd.set("active", String(active));
    fd.set("soldOut", String(soldOut));
    if (removeImage) fd.set("removeImage", "true");
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("photo", file);

    startTransition(async () => {
      await runAction(() => (mode === "create" ? createProduct(fd) : updateProduct(fd)), {
        onSuccess: () => {
          toast.success(mode === "create" ? `${name.trim()} added` : `${name.trim()} saved`);
          clearChosenPhoto();
          if (mode === "create") {
            resetForm();
            onDone?.();
          }
          router.refresh();
        },
      });
    });
  }

  async function handleDeleteConfirmed() {
    if (!product) return;
    // Keep this tied to the `deleting` transition (rather than calling
    // runAction bare) so `busy` below still disables Save while a delete is
    // in flight, matching the rest of this form's pending-state pattern.
    await new Promise<void>((resolve) => {
      startDelete(async () => {
        await runAction(() => deleteProduct(product.id), {
          success: `${product.name} deleted`,
          onSuccess: () => router.refresh(),
        });
        resolve();
      });
    });
  }

  const idBase = product?.id ?? "new";
  const busy = pending || deleting;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">{mode === "create" ? "New product" : product?.name}</p>
        {mode === "edit" && soldOut && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">Sold out</span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        {/* Photo */}
        <div className="shrink-0">
          <Label htmlFor={`photo-${idBase}`}>Photo</Label>
          <div className="mt-2">
            {preview || currentImage ? (
              <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-border">
                <Image
                  src={preview ?? currentImage!}
                  alt="Product photo preview"
                  fill
                  className="object-cover"
                  sizes="160px"
                  unoptimized={Boolean(preview)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (preview) {
                      clearChosenPhoto();
                    } else {
                      setRemoveImage(true);
                    }
                  }}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor={`photo-${idBase}`}
                className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Camera className="h-7 w-7" />
                <span className="text-xs font-medium">Add a photo</span>
              </label>
            )}
            <input
              id={`photo-${idBase}`}
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Core fields */}
        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${idBase}`}>Name</Label>
            <Input id={`name-${idBase}`} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tagline-${idBase}`}>Tagline</Label>
            <Input
              id={`tagline-${idBase}`}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Short one-liner"
              className="h-11"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`desc-${idBase}`}>Description</Label>
        <Textarea id={`desc-${idBase}`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`price-${idBase}`}>Price ($)</Label>
          <Input
            id={`price-${idBase}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`compare-${idBase}`}>Compare-at ($, optional)</Label>
          <Input
            id={`compare-${idBase}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={compareAt}
            onChange={(e) => setCompareAt(e.target.value)}
            placeholder="Was-price for a sale"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Shows the price crossed out, so customers see it&apos;s on sale. Leave blank normally.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`category-${idBase}`}>Category</Label>
          <Input
            id={`category-${idBase}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Supplements"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">Used to group products together in the shop.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`badge-${idBase}`}>Badge (optional)</Label>
          <Input
            id={`badge-${idBase}`}
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="e.g. Sale"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">A small tag shown on the product, e.g. &quot;Sale&quot; or &quot;New&quot;.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`slug-${idBase}`}>Web address (optional)</Label>
          <Input
            id={`slug-${idBase}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={(e) => setSlug(slugifyInput(e.target.value))}
            placeholder="Auto-made from the name"
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">Leave blank and we&apos;ll make one from the name automatically.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`order-${idBase}`}>Order in shop</Label>
          <Input
            id={`order-${idBase}`}
            type="number"
            inputMode="numeric"
            min="0"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Lower numbers show first in the shop. Leave at 0 if you don&apos;t mind the order.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={active} onCheckedChange={setActive} />
          <span className="text-sm font-medium">{active ? "Shown in shop" : "Hidden from shop"}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={soldOut} onCheckedChange={setSoldOut} />
          <span className="text-sm font-medium">{soldOut ? "Sold out" : "In stock"}</span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={busy} size="lg" className="h-11 px-6">
          {pending ? "Saving..." : mode === "create" ? "Add product" : "Save"}
        </Button>
        {mode === "edit" && product && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive" size="lg" className="h-11 px-6" disabled={busy}>
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting..." : "Delete"}
              </Button>
            }
            title={`Delete "${product.name}"?`}
            description="This removes it from the shop for good. This can't be undone."
            confirmLabel="Delete product"
            cancelLabel="Keep product"
            variant="destructive"
            onConfirm={handleDeleteConfirmed}
          />
        )}
      </div>
    </div>
  );
}
