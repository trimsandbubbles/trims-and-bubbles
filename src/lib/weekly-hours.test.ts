import { describe, expect, it } from "vitest";
import { mergeAdjacentRanges } from "./weekly-hours";

describe("mergeAdjacentRanges", () => {
  it("merges back-to-back drop-off slots into one span (4-5,5-6,6-7,7-8 => 4-8)", () => {
    const merged = mergeAdjacentRanges([
      { startTime: "16:00", endTime: "17:00" },
      { startTime: "17:00", endTime: "18:00" },
      { startTime: "18:00", endTime: "19:00" },
      { startTime: "19:00", endTime: "20:00" },
    ]);
    expect(merged).toEqual([{ startTime: "16:00", endTime: "20:00" }]);
  });

  it("preserves a genuine gap (a lunch break stays two spans)", () => {
    const merged = mergeAdjacentRanges([
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "15:00", endTime: "20:00" },
    ]);
    expect(merged).toEqual([
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "15:00", endTime: "20:00" },
    ]);
  });

  it("sorts unordered input and merges overlaps", () => {
    const merged = mergeAdjacentRanges([
      { startTime: "10:00", endTime: "11:30" },
      { startTime: "08:00", endTime: "09:00" },
      { startTime: "09:00", endTime: "10:30" },
    ]);
    expect(merged).toEqual([{ startTime: "08:00", endTime: "11:30" }]);
  });

  it("returns an empty array for no ranges", () => {
    expect(mergeAdjacentRanges([])).toEqual([]);
  });

  it("keeps a single range unchanged", () => {
    expect(mergeAdjacentRanges([{ startTime: "08:00", endTime: "12:00" }])).toEqual([
      { startTime: "08:00", endTime: "12:00" },
    ]);
  });
});
