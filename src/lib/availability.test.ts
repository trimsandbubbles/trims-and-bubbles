import { describe, expect, it } from "vitest";
import { getDaySlotsWithStatus, getOpenSlotsForDate, isSlotStillOpen, type DayHours } from "./availability";

// Tue-Sat 9-5, Sun/Mon closed — mirrors the app's seeded default hours.
// Days now hold an ARRAY of open windows (multiple = a break in the day).
const WEEKLY_HOURS: Record<number, DayHours> = {
  0: null, // Sunday
  1: null, // Monday
  2: [{ startTime: "09:00", endTime: "17:00" }], // Tuesday
  3: [{ startTime: "09:00", endTime: "17:00" }],
  4: [{ startTime: "09:00", endTime: "17:00" }],
  5: [{ startTime: "09:00", endTime: "17:00" }],
  6: [{ startTime: "09:00", endTime: "17:00" }],
};

// Fixed "now" far enough before every test date that minLeadMinutes never
// interferes unless a test is specifically exercising lead-time behavior.
const FAR_PAST_NOW = new Date("2026-01-01T00:00:00Z");

const TUESDAY = "2026-07-14"; // confirmed Tuesday, AEST (winter, UTC+10)
const SUNDAY = "2026-07-12"; // confirmed Sunday, closed by default

describe("getOpenSlotsForDate", () => {
  it("generates evenly-spaced slots across a full open day", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 90,
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      now: FAR_PAST_NOW,
    });

    // 9:00-17:00 = 480 min; last valid start = 480 - 90 = 390 min after open;
    // 30-min steps from 0..390 inclusive = 14 slots.
    expect(slots).toHaveLength(14);
    expect(slots[0].startAt.toISOString()).toBe("2026-07-13T23:00:00.000Z"); // 09:00 AEST
    expect(slots.at(-1)!.startAt.toISOString()).toBe("2026-07-14T05:30:00.000Z"); // 15:30 AEST
    expect(slots.at(-1)!.endAt.toISOString()).toBe("2026-07-14T07:00:00.000Z"); // 17:00 AEST exactly
  });

  it("converts Sydney wall-clock hours to the correct UTC instant (AEST, winter)", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      now: FAR_PAST_NOW,
    });
    // 09:00 Sydney (UTC+10, no DST in July) == 23:00 UTC the day before.
    expect(slots[0].startAt.toISOString()).toBe("2026-07-13T23:00:00.000Z");
  });

  it("converts Sydney wall-clock hours to the correct UTC instant (AEDT, summer)", () => {
    const slots = getOpenSlotsForDate({
      dateStr: "2026-01-13", // a Tuesday, AEDT (UTC+11)
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      now: FAR_PAST_NOW,
    });
    // 09:00 Sydney (UTC+11 during daylight saving) == 22:00 UTC the day before.
    expect(slots[0].startAt.toISOString()).toBe("2026-01-12T22:00:00.000Z");
  });

  it("returns no slots on a day with no weekly hours entry (closed)", () => {
    const slots = getOpenSlotsForDate({
      dateStr: SUNDAY,
      durationMinutes: 60,
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      now: FAR_PAST_NOW,
    });
    expect(slots).toEqual([]);
  });

  it("returns no slots when a CLOSED exception overrides a normally-open day", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 60,
      weeklyHours: WEEKLY_HOURS,
      exception: { type: "CLOSED" },
      busy: [],
      now: FAR_PAST_NOW,
    });
    expect(slots).toEqual([]);
  });

  it("honors a CUSTOM_HOURS exception that opens an otherwise-closed day", () => {
    const slots = getOpenSlotsForDate({
      dateStr: SUNDAY,
      durationMinutes: 60,
      weeklyHours: WEEKLY_HOURS,
      exception: { type: "CUSTOM_HOURS", customStartTime: "10:00", customEndTime: "12:00" },
      busy: [],
      now: FAR_PAST_NOW,
    });
    // 10:00-12:00 = 120 min; last valid start for a 60-min service = 60 min in;
    // 30-min steps: 0, 30, 60 => 3 slots.
    expect(slots).toHaveLength(3);
  });

  it("excludes slots that overlap an existing appointment", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 60,
      weeklyHours: WEEKLY_HOURS,
      busy: [
        {
          startAt: new Date("2026-07-14T00:00:00.000Z"), // 10:00 AEST
          endAt: new Date("2026-07-14T01:00:00.000Z"), // 11:00 AEST
        },
      ],
      bufferMinutes: 15,
      now: FAR_PAST_NOW,
    });

    const clashesWithBooking = slots.some(
      (s) => s.startAt < new Date("2026-07-14T01:15:00.000Z") && s.endAt > new Date("2026-07-14T00:00:00.000Z"),
    );
    expect(clashesWithBooking).toBe(false);

    // Buffered range is [10:00, 11:15) AEST; the 30-min grid's next point at
    // or after 11:15 is 11:30 AEST, which should be offered.
    const boundarySlot = slots.find((s) => s.startAt.toISOString() === "2026-07-14T01:30:00.000Z");
    expect(boundarySlot).toBeDefined();
  });

  it("applies bufferMinutes as a gap after existing bookings, not before", () => {
    const withBuffer = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [{ startAt: new Date("2026-07-14T01:00:00.000Z"), endAt: new Date("2026-07-14T02:00:00.000Z") }],
      bufferMinutes: 30,
      now: FAR_PAST_NOW,
    });
    // A slot ending exactly when the busy interval starts (no buffer needed
    // *before* it) should still be offered.
    const rightBeforeBooking = withBuffer.find((s) => s.endAt.toISOString() === "2026-07-14T01:00:00.000Z");
    expect(rightBeforeBooking).toBeDefined();

    // But a slot starting right when the booking ends should NOT be offered —
    // it needs the 30-min buffer after.
    const rightAfterBooking = withBuffer.find((s) => s.startAt.toISOString() === "2026-07-14T02:00:00.000Z");
    expect(rightAfterBooking).toBeUndefined();
  });

  // Regression cover for a reported "bug": a tester booked a dog at 5pm on
  // Thursday 23 July, then found no slots at 4pm and concluded the picker was
  // broken. It wasn't. The salon's real hours are only 16:00-20:00 on
  // Mon/Thu/Fri, so a long first booking genuinely consumes the evening. These
  // tests pin down that the engine is right, so nobody "fixes" it later.
  describe("short evening windows (real Mon/Thu/Fri hours)", () => {
    const THURSDAY = "2026-07-23"; // the exact date reported; a Thursday, AEST
    const EVENING_HOURS: Record<number, DayHours> = {
      0: [{ startTime: "09:00", endTime: "17:00" }],
      1: [{ startTime: "16:00", endTime: "20:00" }],
      2: null,
      3: null,
      4: [{ startTime: "16:00", endTime: "20:00" }],
      5: [{ startTime: "16:00", endTime: "20:00" }],
      6: [{ startTime: "09:00", endTime: "17:00" }],
    };

    it("still offers 4pm for a short service when a 1-hour booking sits at 5pm", () => {
      const slots = getOpenSlotsForDate({
        dateStr: THURSDAY,
        durationMinutes: 60,
        weeklyHours: EVENING_HOURS,
        busy: [
          {
            startAt: new Date("2026-07-23T07:00:00.000Z"), // 17:00 AEST
            endAt: new Date("2026-07-23T08:00:00.000Z"), // 18:00 AEST
          },
        ],
        bufferMinutes: 15,
        now: FAR_PAST_NOW,
      });

      // 16:00-17:00 does not overlap the buffered [17:00, 18:15) range.
      const fourPm = slots.find((s) => s.startAt.toISOString() === "2026-07-23T06:00:00.000Z");
      expect(fourPm).toBeDefined();
    });

    it("correctly leaves nothing when a 3-hour full groom takes the whole evening", () => {
      const slots = getOpenSlotsForDate({
        dateStr: THURSDAY,
        durationMinutes: 90,
        weeklyHours: EVENING_HOURS,
        busy: [
          {
            startAt: new Date("2026-07-23T07:00:00.000Z"), // 17:00 AEST
            endAt: new Date("2026-07-23T10:00:00.000Z"), // 20:00 AEST — closing
          },
        ],
        bufferMinutes: 15,
        now: FAR_PAST_NOW,
      });

      // Every 90-minute start in a 16:00-20:00 window collides with a booking
      // that runs 17:00 to close. Empty is the CORRECT answer here.
      expect(slots).toEqual([]);
    });

    it("cannot fit a 3-hour groom for two dogs into a 4-hour evening", () => {
      const slots = getOpenSlotsForDate({
        dateStr: THURSDAY,
        durationMinutes: 360, // two full grooms back to back
        weeklyHours: EVENING_HOURS,
        busy: [],
        now: FAR_PAST_NOW,
      });
      expect(slots).toEqual([]);
    });
  });

  it("does not offer a slot that doesn't fully fit before closing time", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 481, // one minute longer than the entire 8-hour day
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      now: FAR_PAST_NOW,
    });
    expect(slots).toEqual([]);
  });

  it("respects minLeadMinutes to exclude slots too close to now", () => {
    // "Now" is 14:45 AEST on the test Tuesday; with a 60-min lead time,
    // nothing before 15:45 AEST should be offered. The 30-min grid's next
    // point at or after 15:45 AEST is 16:00 AEST.
    const now = new Date("2026-07-14T04:45:00.000Z"); // 14:45 AEST
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [],
      minLeadMinutes: 60,
      now,
    });
    expect(slots.every((s) => s.startAt.getTime() >= now.getTime() + 60 * 60_000)).toBe(true);
    expect(slots.some((s) => s.startAt.toISOString() === "2026-07-14T06:00:00.000Z")).toBe(true); // 16:00 AEST
    expect(slots.some((s) => s.startAt.toISOString() === "2026-07-14T05:30:00.000Z")).toBe(false); // 15:30 AEST — too soon
  });

  it("respects a custom slotIntervalMinutes granularity", () => {
    const slots = getOpenSlotsForDate({
      dateStr: SUNDAY,
      durationMinutes: 60,
      weeklyHours: WEEKLY_HOURS,
      exception: { type: "CUSTOM_HOURS", customStartTime: "09:00", customEndTime: "10:00" },
      busy: [],
      slotIntervalMinutes: 60,
      now: FAR_PAST_NOW,
    });
    // Exactly one hour available for a 60-min service at 60-min granularity => exactly 1 slot.
    expect(slots).toHaveLength(1);
  });

  it("supports multiple windows in a day and never offers a slot spanning the break", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 90,
      // 09:00-12:00, break, 15:00-20:00 — the owner's mid-day-break scenario.
      weeklyHours: { ...WEEKLY_HOURS, 2: [{ startTime: "09:00", endTime: "12:00" }, { startTime: "15:00", endTime: "20:00" }] },
      busy: [],
      now: FAR_PAST_NOW,
    });

    // Morning window 180 min: starts 09:00..10:30 (4 slots).
    // Evening window 300 min: starts 15:00..18:30 (8 slots). Total 12.
    expect(slots).toHaveLength(12);
    // No slot may START in the morning and END after 12:00 (i.e. cross the break):
    const noon = new Date("2026-07-14T02:00:00.000Z"); // 12:00 AEST
    const three = new Date("2026-07-14T05:00:00.000Z"); // 15:00 AEST
    expect(slots.some((s) => s.startAt < noon && s.endAt > noon)).toBe(false);
    // Nothing is offered inside the break itself:
    expect(slots.some((s) => s.startAt >= noon && s.startAt < three)).toBe(false);
    // The last morning slot ends exactly at the break:
    expect(slots.some((s) => s.endAt.toISOString() === noon.toISOString())).toBe(true);
    // Results are time-ordered across windows:
    const times = slots.map((s) => s.startAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("a service too long for the morning window is still offered in the longer evening window", () => {
    const slots = getOpenSlotsForDate({
      dateStr: TUESDAY,
      durationMinutes: 240, // 4h — doesn't fit 09:00-12:00, fits 15:00-20:00
      weeklyHours: { ...WEEKLY_HOURS, 2: [{ startTime: "09:00", endTime: "12:00" }, { startTime: "15:00", endTime: "20:00" }] },
      busy: [],
      now: FAR_PAST_NOW,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startAt >= new Date("2026-07-14T05:00:00.000Z"))).toBe(true); // all >= 15:00 AEST
  });
});

describe("getDaySlotsWithStatus", () => {
  it("classifies grid times lost to an existing booking as booked, not hidden", () => {
    const { open, booked } = getDaySlotsWithStatus({
      dateStr: TUESDAY,
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [
        {
          startAt: new Date("2026-07-14T00:00:00.000Z"), // 10:00 AEST
          endAt: new Date("2026-07-14T01:00:00.000Z"), // 11:00 AEST
        },
      ],
      bufferMinutes: 0,
      now: FAR_PAST_NOW,
    });

    // 10:00 and 10:30 clash → booked; everything else on the 9-5 grid is open.
    expect(booked.map((s) => s.startAt.toISOString())).toEqual([
      "2026-07-14T00:00:00.000Z",
      "2026-07-14T00:30:00.000Z",
    ]);
    expect(open.some((s) => s.startAt.toISOString() === "2026-07-13T23:30:00.000Z")).toBe(true); // 09:30 open
    expect(open.some((s) => s.startAt.toISOString() === "2026-07-14T01:00:00.000Z")).toBe(true); // 11:00 open again
    // open + booked together cover the whole uninterrupted grid.
    expect(open.length + booked.length).toBe(16);
  });

  it("returns empty lists on a closed day (no phantom booked entries)", () => {
    const { open, booked } = getDaySlotsWithStatus({
      dateStr: SUNDAY,
      durationMinutes: 30,
      weeklyHours: WEEKLY_HOURS,
      busy: [{ startAt: new Date("2026-07-12T00:00:00.000Z"), endAt: new Date("2026-07-12T01:00:00.000Z") }],
      now: FAR_PAST_NOW,
    });
    expect(open).toEqual([]);
    expect(booked).toEqual([]);
  });
});

describe("isSlotStillOpen", () => {
  const busy = [{ startAt: new Date("2026-07-14T00:00:00.000Z"), endAt: new Date("2026-07-14T01:00:00.000Z") }];

  it("returns true for a candidate that doesn't overlap and clears the buffer", () => {
    const candidate = { startAt: new Date("2026-07-14T01:15:00.000Z"), endAt: new Date("2026-07-14T02:00:00.000Z") };
    expect(isSlotStillOpen(candidate, busy, 15)).toBe(true);
  });

  it("returns false for a candidate that overlaps an existing busy interval", () => {
    const candidate = { startAt: new Date("2026-07-14T00:30:00.000Z"), endAt: new Date("2026-07-14T01:30:00.000Z") };
    expect(isSlotStillOpen(candidate, busy, 15)).toBe(false);
  });

  it("returns false for a candidate inside the buffer window after a busy interval", () => {
    const candidate = { startAt: new Date("2026-07-14T01:05:00.000Z"), endAt: new Date("2026-07-14T01:35:00.000Z") };
    expect(isSlotStillOpen(candidate, busy, 15)).toBe(false);
  });

  it("returns true when there is no busy interval at all", () => {
    const candidate = { startAt: new Date("2026-07-14T01:05:00.000Z"), endAt: new Date("2026-07-14T01:35:00.000Z") };
    expect(isSlotStillOpen(candidate, [], 15)).toBe(true);
  });
});
