"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * A reusable, on-brand replacement for `window.confirm()`.
 *
 * Buttons are named for their OUTCOME ("Yes, cancel it" / "Keep booking"),
 * never "OK"/"Cancel" — per Nielsen Norman Group guidance, a dismiss button
 * labelled "Cancel" is genuinely ambiguous next to a confirm action that is
 * itself *about* cancelling something.
 *
 * The dialog stays open and shows a busy state while `onConfirm` is in
 * flight, and only closes once it resolves. It never closes itself if
 * `onConfirm` rejects, so the caller gets a chance to retry — though in
 * practice every caller should route its action through `runAction`
 * (`@/lib/run-action`), which never throws and always toasts the error.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  variant = "default",
  pending = false,
  open: controlledOpen,
  onOpenChange,
  onConfirm,
}: {
  /** The element that opens the dialog. Omit when driving it with `open`. */
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  pending?: boolean;
  /** Controlled mode — for confirmations raised by something other than a
   * button press (a calendar drag, a row click). Pair with `onOpenChange` so
   * the parent can clear its own pending state when the user backs out;
   * otherwise the same action can never be retried. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}): React.ReactElement {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  const [submitting, setSubmitting] = React.useState(false);
  // Respect an externally-controlled `pending` (e.g. a caller's own
  // useTransition) as well as our own internal in-flight tracking, so this
  // works whether or not the caller manages busy state itself.
  const busy = pending || submitting;

  function handleOpenChange(next: boolean) {
    // Block every dismissal path (backdrop press, escape key, close button,
    // trigger re-press) while a confirm is in flight.
    if (busy && !next) return;
    setOpen(next);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      // Last-resort guard: callers are expected to go through `runAction`,
      // which never throws, so this should be unreachable in practice. If it
      // does happen, keep the dialog open and the button responsive instead
      // of leaving the user staring at a stuck busy state.
      console.error("[ConfirmDialog] onConfirm rejected:", error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger render={trigger as React.ReactElement} /> : null}
      <DialogContent showCloseButton={!busy} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" size="touch" disabled={busy} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            size="touch"
            // The shared `destructive` variant is a 10%-opacity tint, which
            // reads as a tertiary control. That's fine for a button that merely
            // *opens* this dialog, but the final confirm step needs to look as
            // consequential as it is — so fill it solid here only, rather than
            // restyling every destructive button in the app.
            className={
              variant === "destructive"
                ? "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90"
                : undefined
            }
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
