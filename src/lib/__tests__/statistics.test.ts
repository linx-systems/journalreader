import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeGranularityMs, getGranularityLabel } from "../statistics";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

describe("computeGranularityMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns explicit granularity mapping", () => {
    expect(computeGranularityMs("10min")).toBe(10 * MINUTE_MS);
    expect(computeGranularityMs("1hour")).toBe(HOUR_MS);
    expect(computeGranularityMs("6hour")).toBe(6 * HOUR_MS);
    expect(computeGranularityMs("1day")).toBe(DAY_MS);
    expect(computeGranularityMs("1week")).toBe(WEEK_MS);
  });

  it("auto defaults to 15 minutes when no range provided", () => {
    expect(computeGranularityMs("auto")).toBe(10 * MINUTE_MS);
  });

  it("auto selects 10min for short ranges", () => {
    expect(computeGranularityMs("auto", "5 hours ago", "0 minutes ago")).toBe(
      10 * MINUTE_MS
    );
  });

  it("auto selects 1hour at the 6-hour boundary", () => {
    expect(computeGranularityMs("auto", "6 hours ago", "0 minutes ago")).toBe(
      HOUR_MS
    );
  });

  it("auto selects 6hour at the 7-day boundary", () => {
    expect(computeGranularityMs("auto", "7 days ago", "0 minutes ago")).toBe(
      6 * HOUR_MS
    );
  });

  it("auto selects 1day at the 30-day boundary", () => {
    expect(computeGranularityMs("auto", "30 days ago", "0 minutes ago")).toBe(
      DAY_MS
    );
  });

  it("auto selects 1week beyond 30 days", () => {
    expect(computeGranularityMs("auto", "31 days ago", "0 minutes ago")).toBe(
      WEEK_MS
    );
  });

  it("auto falls back to now for invalid inputs", () => {
    expect(computeGranularityMs("auto", "not a date", "also bad")).toBe(
      10 * MINUTE_MS
    );
  });

  it("auto parses ISO date strings", () => {
    expect(
      computeGranularityMs("auto", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z")
    ).toBe(HOUR_MS);
  });
});

describe("getGranularityLabel", () => {
  it("returns labels for each granularity", () => {
    expect(getGranularityLabel("auto")).toBe("Auto");
    expect(getGranularityLabel("10min")).toBe("10 min");
    expect(getGranularityLabel("1hour")).toBe("1 hour");
    expect(getGranularityLabel("6hour")).toBe("6 hours");
    expect(getGranularityLabel("1day")).toBe("1 day");
    expect(getGranularityLabel("1week")).toBe("1 week");
  });
});
