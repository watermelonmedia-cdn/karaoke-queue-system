import { describe, it, expect } from "vitest";
import { dateOnlyToISO, isoToDateOnly, formatEventDate } from "./utils";

describe("event dates survive timezone conversion", () => {
  it("round-trips a summer date (MDT, UTC-6)", () => {
    const iso = dateOnlyToISO("2026-07-22");
    expect(isoToDateOnly(iso)).toBe("2026-07-22");
    expect(formatEventDate(iso)).toContain("Jul 22, 2026");
  });

  it("round-trips a winter date (MST, UTC-7)", () => {
    const iso = dateOnlyToISO("2026-01-15");
    expect(isoToDateOnly(iso)).toBe("2026-01-15");
    expect(formatEventDate(iso)).toContain("Jan 15, 2026");
  });

  it("does not slip a day across the DST boundary", () => {
    for (const d of ["2026-03-07","2026-03-08","2026-03-09",
                     "2026-10-31","2026-11-01","2026-11-02"]) {
      expect(isoToDateOnly(dateOnlyToISO(d))).toBe(d);
    }
  });

  it("does not slip on new year or month ends", () => {
    for (const d of ["2025-12-31","2026-01-01","2026-02-28","2026-06-30"]) {
      expect(isoToDateOnly(dateOnlyToISO(d))).toBe(d);
    }
  });

  it("stores at noon UTC, far from any day boundary", () => {
    expect(new Date(dateOnlyToISO("2026-07-22")).getUTCHours()).toBe(12);
  });

  it("shows no time in the display string", () => {
    const s = formatEventDate(dateOnlyToISO("2026-07-22"));
    expect(s).not.toMatch(/\d{1,2}:\d{2}/);
    expect(s).not.toMatch(/AM|PM/i);
  });

  it("handles junk input without throwing", () => {
    expect(formatEventDate("")).toBe("");
    expect(formatEventDate("not-a-date")).toBe("");
    expect(isoToDateOnly("garbage")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
