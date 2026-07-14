"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type ElementType } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSiteContent } from "@/components/site-content/edit-context";
import { updateSiteText } from "@/lib/actions/site-content";

export function EditableText({
  contentKey,
  as = "p",
  className,
  multiline = false,
  accentClassName,
  children,
}: {
  contentKey: string;
  as?: ElementType;
  className?: string;
  /**
   * When true, line breaks in the value render as <br/> and the inline editor
   * lets the owner add/remove them. Use for short multi-line headings.
   */
  multiline?: boolean;
  /**
   * Optional class applied to the LAST line only (an accent colour, say). Lets
   * a styled headline stay editable as plain text while keeping its accent —
   * the owner edits words and line breaks, the accent follows the last line.
   */
  accentClassName?: string;
  /** The hard-coded DEFAULT text — always a plain string. */
  children: string;
}) {
  const { content, isOwner, editMode, setLocal } = useSiteContent();
  const value = content[contentKey] ?? children;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const As = as;

  // Render the value, honouring multiline line breaks and an optional accent on
  // the final line. Single-line, non-accent values return the raw string, so
  // the public/non-edit DOM stays byte-for-byte identical to a plain element.
  function renderValue() {
    if (!multiline && !accentClassName) return value;
    const lines = value.split("\n");
    return lines.map((line, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {accentClassName && i === lines.length - 1 ? (
          <span className={accentClassName}>{line}</span>
        ) : (
          line
        )}
      </Fragment>
    ));
  }

  // Focus + move caret to end once the textarea mounts (draft is seeded in the
  // click/keydown handler that opens the editor, so no setState in this effect).
  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [editing]);

  function startEditing() {
    setDraft(value);
    setEditing(true);
  }

  // Public visitors and the owner-when-not-editing see exactly the original
  // element — pixel-identical, no affordances.
  if (!(isOwner && editMode)) {
    return <As className={className}>{renderValue()}</As>;
  }

  function save() {
    const next = draft;
    startTransition(async () => {
      try {
        const result = await updateSiteText(contentKey, next);
        if (result.status === "success") {
          setLocal(contentKey, next);
          setEditing(false);
          toast.success("Saved");
        } else {
          // Keep the editor open with the draft intact so nothing is lost.
          toast.error(result.message);
        }
      } catch {
        // Network drop, expired login, etc. Never throw away her words.
        toast.error("Couldn't save — check your connection and try again. Your text is safe.");
      }
    });
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="block w-full">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
          rows={multiline ? 4 : 3}
          className="w-full"
          aria-label="Edit text"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending}
            className="min-h-11 px-4"
          >
            <Check className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={cancel}
            disabled={pending}
            className="min-h-11 px-4"
          >
            <X className="h-4 w-4" /> Cancel
          </Button>
        </span>
      </span>
    );
  }

  // Edit mode, not yet editing this field: show the text with a subtle
  // editable affordance. Clicking anywhere on it opens the inline editor. The
  // padding + matching negative margin enlarges the tap target (~44px) without
  // shifting the surrounding layout.
  return (
    <As
      className={cn(
        className,
        "relative -mx-1.5 -my-1 cursor-pointer rounded-md px-1.5 py-1 outline-1 outline-dashed outline-transparent transition-colors hover:outline-ring focus-visible:outline-ring",
      )}
      role="button"
      tabIndex={0}
      title="Click to edit"
      aria-label="Click to edit this text"
      onClick={startEditing}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEditing();
        }
      }}
    >
      {renderValue()}
      <Pencil
        aria-hidden
        className="ml-1 inline-block h-3.5 w-3.5 translate-y-[-1px] text-muted-foreground opacity-70"
      />
    </As>
  );
}
