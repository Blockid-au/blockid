import { describe, expect, it } from "vitest";
import { parseCompletedTaskIds } from "./parse-task-ids";

const FS = "\x1f";
const RS = "\x1e";

function log(commits: Array<[string, string]>): string {
  return commits.map(([sha, body]) => `${sha}${FS}${body}`).join(RS) + RS;
}

describe("parseCompletedTaskIds", () => {
  it("extracts one task id from a single commit", () => {
    const out = parseCompletedTaskIds(log([["abc1234", "fix(auto): tidy nav (T0216)"]]));
    expect(out.idToCommit.get("T0216")).toBe("abc1234");
    expect(out.lastCommit).toBe("abc1234");
  });

  it("maps each id to the FIRST commit that mentions it", () => {
    const out = parseCompletedTaskIds(
      log([
        ["aaaaaaa", "feat(auto): first pass (T0301)"],
        ["bbbbbbb", "fix(auto): follow-up on T0301"],
      ]),
    );
    expect(out.idToCommit.get("T0301")).toBe("aaaaaaa");
    expect(out.lastCommit).toBe("aaaaaaa");
  });

  it("handles multiple ids in one commit body", () => {
    const out = parseCompletedTaskIds(
      log([["deadbee", "feat: ship T0100 and also T0101\n\nBoth landed."]]),
    );
    expect(out.idToCommit.get("T0100")).toBe("deadbee");
    expect(out.idToCommit.get("T0101")).toBe("deadbee");
  });

  it("supports 4-digit and 5-digit T-ids (T0XXX and T0XXXX)", () => {
    const out = parseCompletedTaskIds(
      log([["1111111", "feat: T0999 and T01234 in one commit"]]),
    );
    expect(out.idToCommit.get("T0999")).toBe("1111111");
    expect(out.idToCommit.get("T01234")).toBe("1111111");
  });

  it("skips ids mentioned inside orchestrator release commits (T0216 regression)", () => {
    // A release commit lists every previously-shipped id in its body. If we
    // trusted those matches, reopening a task would immediately re-close it
    // against the release sha, hiding real regressions.
    const out = parseCompletedTaskIds(
      log([
        [
          "9999999",
          "chore(release): v3.12.0 — 3 task(s) shipped (minor)\n\nCEO implementing-plan loop: T0100, T0101, T0216.",
        ],
        ["7777777", "docs: update roadmap notes"],
      ]),
    );
    expect(out.idToCommit.has("T0100")).toBe(false);
    expect(out.idToCommit.has("T0216")).toBe(false);
    // lastCommit still tracks the newest sha regardless of skip decision.
    expect(out.lastCommit).toBe("9999999");
  });

  it("ignores malformed entries (missing separator, non-hex sha)", () => {
    const out = parseCompletedTaskIds(
      [
        `notasha${FS}body mentions T0100`,
        `abc1234${FS}real body T0200`,
        `no-separator-at-all`,
      ].join(RS) + RS,
    );
    expect(out.idToCommit.has("T0100")).toBe(false);
    expect(out.idToCommit.get("T0200")).toBe("abc1234");
  });

  it("returns empty map + empty lastCommit for empty input", () => {
    const out = parseCompletedTaskIds("");
    expect(out.idToCommit.size).toBe(0);
    expect(out.lastCommit).toBe("");
  });

  it("does not treat substrings like T1234 or FT0100 as task ids", () => {
    const out = parseCompletedTaskIds(
      log([["abc1234", "feat: mentions FT0100 and T1234 but no real ids"]]),
    );
    expect(out.idToCommit.size).toBe(0);
  });
});
