"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import type {
  DatesSetArg,
  DateSelectArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import { Ban, CalendarCheck2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { createBlockedTimeSlot, deleteBlockedTimeSlot } from "@/lib/actions/admin-calendar";

/** The salon's timezone. The calendar is pinned to this so it reads correctly
 * no matter where the owner is viewing from (matches BUSINESS_TIMEZONE in
 * src/lib/availability.ts). */
const BUSINESS_TIMEZONE = "Australia/Sydney";

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const SYDNEY_WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, weekday: "short" });

/** The 0–6 weekday of a calendar column, read in the salon's timezone. Both
 * getDay() (viewer-local) and getUTCDay() give the wrong answer once the
 * calendar is pinned to a timezone different from the viewer's, because the
 * marker Date FullCalendar hands us doesn't line up with either. Formatting in
 * the business timezone is correct regardless of how the marker is expressed. */
function sydneyWeekday(date: Date): number {
  return WEEKDAY_INDEX[SYDNEY_WEEKDAY_FMT.format(date)];
}

export type CalendarEventDTO = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Appointment status (used to pick a color) — meaningless for "blocked" events. */
  status: string;
  kind: "appointment" | "blocked";
};

/** One open window on one weekday — matches FullCalendar's `businessHours` shape. */
export type BusinessHoursWindow = { daysOfWeek: number[]; startTime: string; endTime: string };

// Status colours: a background + a text colour picked for contrast, defined
// as a small themed block appended to globals.css (see the "FULLCALENDAR
// THEMING" block at the end of that file) so they stay on-brand without
// touching the existing theme tokens.
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING_PAYMENT: { bg: "var(--cal-status-pending-bg)", fg: "var(--cal-status-pending-fg)", label: "Pending payment" },
  CONFIRMED: { bg: "var(--cal-status-confirmed-bg)", fg: "var(--cal-status-confirmed-fg)", label: "Confirmed" },
  IN_PROGRESS: { bg: "var(--cal-status-progress-bg)", fg: "var(--cal-status-progress-fg)", label: "In progress" },
  COMPLETED: { bg: "var(--cal-status-completed-bg)", fg: "var(--cal-status-completed-fg)", label: "Completed" },
};
const BLOCKED_STYLE = { bg: "var(--cal-status-blocked-bg)", fg: "var(--cal-status-blocked-fg)", label: "Blocked / unavailable" };
const FALLBACK_STYLE = { bg: "var(--cal-status-confirmed-bg)", fg: "var(--cal-status-confirmed-fg)" };

const LEGEND_ITEMS = [
  ...Object.values(STATUS_STYLE),
  BLOCKED_STYLE,
];

// Below this width, default to a single-day view — seven columns don't fit a
// phone screen legibly. Matches Tailwind's `sm` breakpoint.
const MOBILE_BREAKPOINT_PX = 640;

function renderEventContent(arg: EventContentArg) {
  const kind = arg.event.extendedProps.kind as "appointment" | "blocked";
  const Icon = kind === "blocked" ? Ban : CalendarCheck2;
  return (
    <div className="flex min-w-0 items-start gap-1 overflow-hidden px-0.5 py-px text-[11px] leading-tight sm:text-xs">
      <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span className="flex min-w-0 flex-col overflow-hidden">
        {arg.timeText && <span className="truncate font-semibold">{arg.timeText}</span>}
        <span className="truncate">{arg.event.title}</span>
      </span>
    </div>
  );
}

// Calendar clicks/drags aren't a button press, so these confirmations are
// driven in ConfirmDialog's controlled mode: `open` follows the pending state,
// and `onOpenChange(false)` clears it. Clearing on dismiss is the important
// part — otherwise backing out would leave the pending state set and the same
// block could never be clicked again.

export function AdminCalendar({
  events,
  businessHours,
  slotMinTime = "08:00:00",
  slotMaxTime = "20:30:00",
}: {
  events: CalendarEventDTO[];
  businessHours: BusinessHoursWindow[];
  slotMinTime?: string;
  slotMaxTime?: string;
}) {
  const router = useRouter();
  const calendarRef = useRef<FullCalendar>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; title: string } | null>(null);
  const [pendingBlock, setPendingBlock] = useState<{ startIso: string; endIso: string; label: string } | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [title, setTitle] = useState("");
  const [viewType, setViewType] = useState<"timeGridDay" | "timeGridWeek" | "dayGridMonth">("timeGridWeek");

  // Weekdays with no open window at all — used to label closed columns
  // ("Tue Closed") in addition to the shaded businessHours background,
  // since a fully-shaded column can otherwise look just like an empty one.
  const closedWeekdays = useMemo(() => {
    const open = new Set(businessHours.flatMap((w) => w.daysOfWeek));
    const closed = new Set<number>();
    for (let d = 0; d < 7; d++) if (!open.has(d)) closed.add(d);
    return closed;
  }, [businessHours]);

  function dayHeaderContent(arg: DayHeaderContentArg) {
    // Read the column's weekday in the salon's timezone — see sydneyWeekday.
    // This must match how FullCalendar maps businessHours to columns, so the
    // "Closed" label and the shaded background always agree.
    const closed = closedWeekdays.has(sydneyWeekday(arg.date));
    return (
      <span className="flex flex-col items-center gap-0 py-0.5 leading-tight">
        <span>{arg.text}</span>
        {closed && <span className="text-[10px] font-normal text-muted-foreground">Closed</span>}
      </span>
    );
  }

  function handleDatesSet(arg: DatesSetArg) {
    setTitle(arg.view.title);
    setViewType(arg.view.type as typeof viewType);
  }

  // Default to day view on phones, week view everywhere else — and follow
  // the breakpoint live if the window is resized or a phone is rotated.
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const applyForWidth = (isMobile: boolean) => {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      const desired = isMobile ? "timeGridDay" : "timeGridWeek";
      if (api.view.type !== desired) api.changeView(desired);
    };
    applyForWidth(mql.matches);
    const onChange = (e: MediaQueryListEvent) => applyForWidth(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // Only run this on mount / breakpoint changes, not on every view change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEventClick(info: EventClickArg) {
    const kind = info.event.extendedProps.kind as "appointment" | "blocked";
    if (kind === "appointment") {
      router.push(`/admin/appointments/${info.event.id}`);
      return;
    }
    setPendingRemoval({ id: info.event.id, title: info.event.title });
  }

  function handleSelect(info: DateSelectArg) {
    const label = `${info.start.toLocaleString("en-AU", { timeZone: BUSINESS_TIMEZONE, weekday: "short", hour: "numeric", minute: "2-digit" })} – ${info.end.toLocaleString("en-AU", { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" })}`;
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
    <div className="rounded-xl border border-border bg-card p-2 sm:p-4 [--fc-border-color:var(--color-border)] [--fc-today-bg-color:var(--color-muted)] [--fc-page-bg-color:transparent] [--fc-non-business-color:color-mix(in_oklch,var(--color-foreground)_9%,transparent)]">
      {/* Custom toolbar — FullCalendar's built-in one renders unbranded chrome
          and its prev/next icons depend on a data: URI icon font that this
          app's CSP (font-src 'self') blocks, so they show as empty squares.
          Driving our own buttons through the calendar API sidesteps both
          problems and lets the toolbar stack sanely on mobile. */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 truncate text-base font-bold text-foreground sm:text-lg">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous"
              onClick={() => calendarRef.current?.getApi().prev()}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => calendarRef.current?.getApi().today()}>
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next"
              onClick={() => calendarRef.current?.getApi().next()}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
            {(
              [
                ["dayGridMonth", "Month"],
                ["timeGridWeek", "Week"],
                ["timeGridDay", "Day"],
              ] as const
            ).map(([view, label]) => (
              <Button
                key={view}
                type="button"
                variant={viewType === view ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full"
                onClick={() => calendarRef.current?.getApi().changeView(view)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxon3Plugin]}
        // Pin the whole calendar to the salon's timezone. Without this,
        // FullCalendar renders in the VIEWER's browser timezone, so the owner
        // viewing from overseas would see every appointment shifted by hours
        // (a Sydney 1pm groom showing the night before, off the bottom of the
        // grid). The luxon plugin is what enables a named IANA timezone here.
        timeZone={BUSINESS_TIMEZONE}
        initialView="timeGridWeek"
        headerToolbar={false}
        datesSet={handleDatesSet}
        dayHeaderContent={dayHeaderContent}
        businessHours={businessHours}
        events={events.map((e) => {
          const style = e.kind === "blocked" ? BLOCKED_STYLE : (STATUS_STYLE[e.status] ?? FALLBACK_STYLE);
          return {
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            backgroundColor: style.bg,
            borderColor: style.bg,
            textColor: style.fg,
            classNames: e.kind === "blocked" ? ["fc-event--blocked"] : ["fc-event--appointment"],
            extendedProps: { kind: e.kind },
          };
        })}
        eventContent={renderEventContent}
        eventClick={handleEventClick}
        selectable
        select={handleSelect}
        selectMirror
        nowIndicator
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        allDaySlot={false}
        height="auto"
        expandRows
        firstDay={1}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Click any appointment to open it. Drag across an empty time to block it off (lunch, a day off, a vet run).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: item.bg }}
            />
            {item.label}
          </span>
        ))}
      </div>

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
