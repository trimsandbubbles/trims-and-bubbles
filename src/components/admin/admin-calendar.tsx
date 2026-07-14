"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";
import { toast } from "sonner";
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

export function AdminCalendar({ events }: { events: CalendarEventDTO[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleEventClick(info: EventClickArg) {
    const kind = info.event.extendedProps.kind as "appointment" | "blocked";
    if (kind === "appointment") {
      router.push(`/admin/appointments/${info.event.id}`);
      return;
    }
    if (window.confirm(`Remove this block?\n\n${info.event.title}`)) {
      startTransition(async () => {
        const result = await deleteBlockedTimeSlot(info.event.id);
        if (result.status === "success") {
          toast.success("Block removed");
          router.refresh();
        } else {
          toast.error("Couldn't remove that block");
        }
      });
    }
  }

  function handleSelect(info: DateSelectArg) {
    const label = `${info.start.toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit" })} – ${info.end.toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" })}`;
    if (!window.confirm(`Block this time off?\n\n${label}`)) return;
    const reason = window.prompt("Reason (optional):", "") ?? "";
    startTransition(async () => {
      const result = await createBlockedTimeSlot(info.start.toISOString(), info.end.toISOString(), reason);
      if (result.status === "success") {
        toast.success("Time blocked off");
        router.refresh();
      } else {
        toast.error(result.message ?? "Couldn't block that time");
      }
    });
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
    </div>
  );
}
