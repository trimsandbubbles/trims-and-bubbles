"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { createBlockedTimeSlot, deleteBlockedTimeSlot } from "@/lib/actions/admin-calendar";

export type CalendarEventDTO = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Appointment status (used to pick a color) — meaningless for "blocked" events. */
  status: string;
  kind: "appointment" | "blocked";
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: "var(--color-accent)",
  CONFIRMED: "var(--color-primary)",
  IN_PROGRESS: "var(--color-secondary)",
  COMPLETED: "var(--color-muted-foreground)",
};

// Calendar clicks/drags aren't a button press, so these confirmations are
// driven in ConfirmDialog's controlled mode: `open` follows the pending state,
// and `onOpenChange(false)` clears it. Clearing on dismiss is the important
// part — otherwise backing out would leave the pending state set and the same
// block could never be clicked again.

export function AdminCalendar({ events }: { events: CalendarEventDTO[] }) {
  const router = useRouter();
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; title: string } | null>(null);
  const [pendingBlock, setPendingBlock] = useState<{ startIso: string; endIso: string; label: string } | null>(null);
  const [blockReason, setBlockReason] = useState("");

  function handleEventClick(info: EventClickArg) {
    const kind = info.event.extendedProps.kind as "appointment" | "blocked";
    if (kind === "appointment") {
      router.push(`/admin/appointments/${info.event.id}`);
      return;
    }
    setPendingRemoval({ id: info.event.id, title: info.event.title });
  }

  function handleSelect(info: DateSelectArg) {
    const label = `${info.start.toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" })} – ${info.end.toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" })}`;
    setBlockReason("");
    setPendingBlock({ startIso: info.start.toISOString(), endIso: info.end.toISOString(), label });
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    await runAction(() => deleteBlockedTimeSlot(pendingRemoval.id), {
      success: "Block removed",
      onSuccess: () => router.refresh(),
    });
    setPendingRemoval(null);
  }

  async function confirmBlock() {
    if (!pendingBlock) return;
    await runAction(() => createBlockedTimeSlot(pendingBlock.startIso, pendingBlock.endIso, blockReason), {
      success: "Time blocked off",
      onSuccess: () => router.refresh(),
    });
    setPendingBlock(null);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-2 sm:p-4 [--fc-border-color:var(--color-border)] [--fc-today-bg-color:var(--color-muted)] [--fc-page-bg-color:transparent]">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
        events={events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          backgroundColor: e.kind === "blocked" ? "var(--color-destructive)" : (STATUS_COLOR[e.status] ?? "var(--color-primary)"),
          borderColor: e.kind === "blocked" ? "var(--color-destructive)" : (STATUS_COLOR[e.status] ?? "var(--color-primary)"),
          extendedProps: { kind: e.kind },
        }))}
        eventClick={handleEventClick}
        selectable
        select={handleSelect}
        selectMirror
        nowIndicator
        slotMinTime="07:00:00"
        slotMaxTime="19:00:00"
        allDaySlot={false}
        height="auto"
        firstDay={1}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Click any appointment to open it. Drag across an empty time to block it off (lunch, a day off, a vet run).
      </p>

      {pendingRemoval && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setPendingRemoval(null);
          }}
          title="Remove this time block?"
          description={`"${pendingRemoval.title}" will open back up for bookings.`}
          confirmLabel="Remove block"
          cancelLabel="Keep block"
          variant="destructive"
          onConfirm={confirmRemoval}
        />
      )}

      {pendingBlock && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setPendingBlock(null);
          }}
          title="Block this time off?"
          description={
            <span className="flex flex-col gap-3">
              <span className="block text-foreground">
                {pendingBlock.label} won&apos;t be bookable by clients.
              </span>
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                Reason (optional — shown on the calendar)
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Lunch, vet run, day off"
                  maxLength={120}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </span>
          }
          confirmLabel="Block this time"
          cancelLabel="Never mind"
          onConfirm={confirmBlock}
        />
      )}
    </div>
  );
}
