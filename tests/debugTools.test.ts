import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scripts = [
  "debug-clone-tools/make-potensicpro-debuggable.sh",
  "debug-clone-tools/pull-potensicpro-logs.sh",
  "debug-clone-tools/push-mapdb-to-clone.sh",
];

const bashAvailable = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;

describe.runIf(bashAvailable)("debug clone script input validation", () => {
  it.each(scripts)("rejects hostile package names before invoking tools: %s", (script) => {
    const result = spawnSync("bash", [script, "--package", "com.example;touch /tmp/injected"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid Android package name");
  });

  it("rejects clone labels that could break generated XML", () => {
    const result = spawnSync(
      "bash",
      [
        "debug-clone-tools/make-potensicpro-debuggable.sh",
        "--clone-package",
        "debug",
        "--clone-label",
        "<unsafe>",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("clone label contains unsupported characters");
  });

  it("rejects non-positive watch intervals", () => {
    const result = spawnSync(
      "bash",
      ["debug-clone-tools/push-mapdb-to-clone.sh", "--watch", "--interval", "0"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("interval must be a positive number");
  });
});
