import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("index security policy", () => {
  it("restricts executable content and declares required map/search origins", () => {
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("https://nominatim.openstreetmap.org");
    expect(html).toContain("https://tile.openstreetmap.org");
    expect(html).toContain("https://server.arcgisonline.com");
  });
});
