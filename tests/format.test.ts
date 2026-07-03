import { describe, expect, it } from "vitest";
import { fmtDuration } from "../src/features/mission/format";

describe("fmtDuration", () => {
  it("formats whole minutes and seconds as m:ss", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(5)).toBe("0:05");
    expect(fmtDuration(65)).toBe("1:05");
    expect(fmtDuration(3661)).toBe("61:01");
  });

  it("rounds fractional seconds to the nearest whole second", () => {
    expect(fmtDuration(59.6)).toBe("1:00");
    expect(fmtDuration(59.4)).toBe("0:59");
  });
});
