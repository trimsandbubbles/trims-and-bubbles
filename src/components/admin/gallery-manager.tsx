"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  addGalleryImage,
  deleteGalleryImage,
  setAppointmentPhotoFeatured,
  updateGalleryImage,
} from "@/lib/actions/admin-gallery";

/** Suggested group labels, offered via <datalist> on the group-label inputs
 * below so the owner can pick a section instead of typing/spelling it. She
 * can still type a custom label. */
const GROUP_LABEL_SUGGESTIONS = [
  "Dog friends over the years",
  "Full Groom",
  "Wash and Dry",
  "Wash and Tidy",
  "Groom Out",
  "Deshed",
];
const GROUP_LABEL_LIST_ID = "gallery-group-label-suggestions";

function GroupLabelDatalist() {
  return (
    <datalist id={GROUP_LABEL_LIST_ID}>
      {GROUP_LABEL_SUGGESTIONS.map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  );
}

export type GalleryImageRow = {
  id: string;
  url: string;
  caption: string | null;
  groupLabel: string | null;
  displayOrder: number;
  active: boolean;
};

export type AppointmentPhotoRow = {
  id: string;
  url: string;
  caption: string | null;
  isFeaturedOnPublicGallery: boolean;
  petName: string;
  serviceName: string;
  createdAt: string;
};

export function GalleryManager({
  images,
  appointmentPhotos,
}: {
  images: GalleryImageRow[];
  appointmentPhotos: AppointmentPhotoRow[];
}) {
  return (
    <div className="space-y-10">
      <GroupLabelDatalist />
      <AddPhotoForm />

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Gallery photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown on the public gallery, grouped by the label you give each photo.
        </p>
        {images.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No gallery photos yet — add one above to get started.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {images.map((image) => (
              <GalleryImageCard key={image.id} image={image} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Appointment photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos added while completing a groom. Feature one to show it on the public gallery.
        </p>
        {appointmentPhotos.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No appointment photos yet.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {appointmentPhotos.map((photo) => (
              <AppointmentPhotoCard key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Uploader for a standalone gallery photo: file picker (with preview),
 * optional caption + group label, one submit. Mirrors CompleteAppointmentForm. */
function AddPhotoForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
  }

  function clearPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName(null);
    if (formRef.current) {
      const input = formRef.current.elements.namedItem("photo") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addGalleryImage(formData);
      if (result.status === "success") {
        toast.success("Photo added to the gallery");
        clearPhoto();
        formRef.current?.reset();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight">Add a photo</h2>

      <div>
        <Label htmlFor="gallery-photo-input">Photo</Label>
        <div className="mt-2">
          {preview ? (
            <div className="relative h-40 w-40 overflow-hidden rounded-xl border border-border">
              <Image src={preview} alt="Selected photo preview" fill className="object-cover" sizes="160px" />
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Remove photo"
                className="absolute top-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="gallery-photo-input"
              className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <ImagePlus className="h-7 w-7" />
              <span className="text-xs font-medium">Take or choose photo</span>
            </label>
          )}
          <input
            id="gallery-photo-input"
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          {fileName && <p className="mt-1.5 text-xs text-muted-foreground">{fileName}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gallery-caption">Caption (optional)</Label>
          <Input
            id="gallery-caption"
            name="caption"
            maxLength={200}
            placeholder="e.g. Golden Retriever — Full Groom"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gallery-group">Group label (optional)</Label>
          <Input
            id="gallery-group"
            name="groupLabel"
            maxLength={80}
            placeholder="e.g. Full Groom"
            list={GROUP_LABEL_LIST_ID}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Photos with the same group label appear together in a section on your public gallery.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending} size="lg" className="h-11 w-full sm:w-auto">
        {pending ? "Adding..." : "Add to gallery"}
      </Button>
    </form>
  );
}

/** One standalone GalleryImage: caption/group edit, active toggle, delete. */
function GalleryImageCard({ image }: { image: GalleryImageRow }) {
  const router = useRouter();
  const [caption, setCaption] = useState(image.caption ?? "");
  const [groupLabel, setGroupLabel] = useState(image.groupLabel ?? "");
  const [active, setActive] = useState(image.active);
  const [savePending, startSave] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const dirty = caption !== (image.caption ?? "") || groupLabel !== (image.groupLabel ?? "");

  function handleSave() {
    startSave(async () => {
      const result = await updateGalleryImage(image.id, { caption, groupLabel });
      if (result.status === "success") {
        toast.success("Photo updated");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleToggleActive(checked: boolean) {
    setActive(checked);
    startToggle(async () => {
      const result = await updateGalleryImage(image.id, { active: checked });
      if (result.status === "success") {
        toast.success(checked ? "Photo shown on public gallery" : "Photo hidden from public gallery");
        router.refresh();
      } else {
        setActive(!checked);
        toast.error(result.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this photo? This can't be undone.")) return;
    startDelete(async () => {
      const result = await deleteGalleryImage(image.id);
      if (result.status === "success") {
        toast.success("Photo deleted");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  const pending = savePending || togglePending || deletePending;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full">
        <Image src={image.url} alt={image.caption ?? "Gallery photo"} fill className="object-cover" sizes="(min-width: 640px) 45vw, 90vw" />
        {!active && (
          <span className="absolute top-2 left-2">
            <Badge variant="secondary">Hidden</Badge>
          </span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`caption-${image.id}`}>Caption</Label>
          <Input
            id={`caption-${image.id}`}
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Golden Retriever — Full Groom"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`group-${image.id}`}>Group label</Label>
          <Input
            id={`group-${image.id}`}
            value={groupLabel}
            maxLength={80}
            onChange={(e) => setGroupLabel(e.target.value)}
            placeholder="e.g. Full Groom"
            list={GROUP_LABEL_LIST_ID}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            Photos with the same group label appear together in a section on your public gallery.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="flex cursor-pointer items-center gap-2.5">
            <Switch checked={active} onCheckedChange={handleToggleActive} disabled={pending} />
            <span className="text-sm text-muted-foreground">{active ? "Shown" : "Hidden"}</span>
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="lg" className="h-11" onClick={handleSave} disabled={!dirty || pending}>
              {savePending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-11 w-11"
              aria-label="Delete photo"
              onClick={handleDelete}
              disabled={pending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One AppointmentPhoto: read-only pet/service/date context plus a
 * "Show on public gallery" toggle bound to isFeaturedOnPublicGallery. */
function AppointmentPhotoCard({ photo }: { photo: AppointmentPhotoRow }) {
  const router = useRouter();
  const [featured, setFeatured] = useState(photo.isFeaturedOnPublicGallery);
  const [pending, startTransition] = useTransition();

  function handleToggle(checked: boolean) {
    setFeatured(checked);
    startTransition(async () => {
      const result = await setAppointmentPhotoFeatured(photo.id, checked);
      if (result.status === "success") {
        toast.success(checked ? "Featured on public gallery" : "Removed from public gallery");
        router.refresh();
      } else {
        setFeatured(!checked);
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full">
        <Image src={photo.url} alt={photo.caption ?? `${photo.petName} — ${photo.serviceName}`} fill className="object-cover" sizes="(min-width: 640px) 45vw, 90vw" />
        {featured && (
          <span className="absolute top-2 left-2">
            <Badge className="gap-1">
              <Star className="h-3 w-3 fill-current" /> Featured
            </Badge>
          </span>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">
            {photo.petName} — {photo.serviceName}
          </p>
          <p className="text-xs text-muted-foreground">{photo.createdAt}</p>
          {photo.caption && <p className="mt-1 text-sm text-muted-foreground">{photo.caption}</p>}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={featured} onCheckedChange={handleToggle} disabled={pending} />
          <span className="text-sm text-muted-foreground">
            {featured ? "Shown on public gallery" : "Show on public gallery"}
          </span>
        </label>
      </div>
    </div>
  );
}
