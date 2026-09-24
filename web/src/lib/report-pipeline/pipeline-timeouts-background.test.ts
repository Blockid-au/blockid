import { describe, expect, it } from "vitest";
import { BACKGROUND_DEADLINE_MS_DEFAULT, BACKGROUND_W4_RESERVE_MS_DEFAULT, backgroundRunBudget, synthReserveMsFor } from "./pipeline-timeouts";

describe("background run budget (G33-T16b)", () => {
  it("keeps the 420 s deadline (paid drain is capped at 480 s) and gives W4 150 s, SYNTH 90 s, W1–W3 180 s", () => {
    const b = backgroundRunBudget({} as NodeJS.ProcessEnv);
    expect(b).toEqual({ maxCalls: 48, deadlineMs: BACKGROUND_DEADLINE_MS_DEFAULT, w4ReserveMs: BACKGROUND_W4_RESERVE_MS_DEFAULT });
    expect(b.deadlineMs).toBe(420_000);
    expect(b.deadlineMs - b.w4ReserveMs - synthReserveMsFor(b.deadlineMs)).toBe(180_000);
  });

  it("honours env overrides and ignores junk", () => {
    expect(backgroundRunBudget({ REPORT_BACKGROUND_W4_RESERVE_MS: "90000", REPORT_ORDER_DEADLINE_MS: "300000" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ w4ReserveMs: 90_000, deadlineMs: 300_000 });
    expect(backgroundRunBudget({ REPORT_BACKGROUND_W4_RESERVE_MS: "x" } as unknown as NodeJS.ProcessEnv).w4ReserveMs).toBe(150_000);
  });
});
