import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { G30_GATED_ENDPOINTS, activeCrontabEndpoints, scheduledEndpoints } from "./cron-expectations";

describe("activeCrontabEndpoints", () => {
  it("collects $RUN jobs from active lines only — comments and PAUSED-EMAIL lines never count", () => {
    const active = activeCrontabEndpoints([
      "RUN=/home/dovanlong/blockid.au/web/scripts/cron-runner.sh",
      "0 16 * * * bash $RUN svi-snapshot",
      "   30 22 * * * bash $RUN daily-admin-report --timeout 180",
      "# PAUSED-EMAIL 26/09/2026 (founder: tạm không gửi email): 0 19 * * * bash $RUN svi-review",
      "# 0 16 * * * bash $RUN svi-notify",
      "*/2 * * * * bash /home/dovanlong/blockid.au/web/scripts/cron-runner.sh report-order-drain --timeout 110",
      "*/2 * * * * /home/dovanlong/blockid.au/web/scripts/watchdog.sh",
      "",
    ].join("\n"));
    expect([...active].sort()).toEqual(["daily-admin-report", "report-order-drain", "svi-snapshot"]);
  });

  it("matches the committed crontab.production: paused and retired jobs are absent", () => {
    const text = readFileSync(resolve(__dirname, "../../../scripts/crontab.production"), "utf8");
    const active = activeCrontabEndpoints(text);
    for (const ep of ["svi-snapshot", "agent-research", "daily-admin-report", "telegram-report"]) {
      expect(active.has(ep), ep).toBe(true);
    }
    for (const ep of ["svi-notify", "nurture", "svi-review", "weekly-insights", "lead-nurture"]) {
      expect(active.has(ep), ep).toBe(false);
    }
  });
});

describe("scheduledEndpoints", () => {
  const expected = ["svi-snapshot", "svi-review", "publish-insight"];

  it("drops jobs the active crontab does not schedule, and G30-gated jobs until released", () => {
    const active = new Set(["svi-snapshot", "publish-insight"]);
    expect(scheduledEndpoints(expected, { active, g30Released: false })).toEqual(["svi-snapshot"]);
    expect(scheduledEndpoints(expected, { active, g30Released: true })).toEqual(["svi-snapshot", "publish-insight"]);
  });

  it("an unreadable crontab (null) trusts the static list, minus G30-gated jobs", () => {
    expect(scheduledEndpoints(expected, { active: null, g30Released: false })).toEqual(["svi-snapshot", "svi-review"]);
  });

  it("gates the same writers cron-runner.sh defers", () => {
    const runner = readFileSync(resolve(__dirname, "../../../scripts/cron-runner.sh"), "utf8");
    const caseLine = runner.split("\n").find((l) => l.includes("agent-orchestrator|"));
    const fromRunner = (caseLine ?? "").trim().replace(/\)$/, "").split("|");
    expect([...G30_GATED_ENDPOINTS].sort()).toEqual(fromRunner.sort());
  });
});
