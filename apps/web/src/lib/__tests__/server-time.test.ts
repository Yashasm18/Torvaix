import { describe, it, expect } from "vitest";
import { parseServerTimestamp } from "../server-time";

describe("parseServerTimestamp", () => {
  it("reads SQLite CURRENT_TIMESTAMP values as UTC", () => {
    expect(parseServerTimestamp("2026-09-14 16:10:20")?.toISOString()).toBe("2026-09-14T16:10:20.000Z");
  });

  it("keeps timestamps that already carry a zone", () => {
    expect(parseServerTimestamp("2026-09-14T16:10:20.000Z")?.toISOString()).toBe("2026-09-14T16:10:20.000Z");
    expect(parseServerTimestamp("2026-09-14T21:40:20+05:30")?.toISOString()).toBe("2026-09-14T16:10:20.000Z");
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseServerTimestamp(null)).toBeNull();
    expect(parseServerTimestamp("")).toBeNull();
    expect(parseServerTimestamp("not a date")).toBeNull();
  });
});
