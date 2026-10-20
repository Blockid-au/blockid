// O1 / L1-12 — app-side ops alert e-mail: per-(kind, level, UTC day) dedup.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn(async () => ({ ok: true }));
vi.mock("./email-core", () => ({ sendEmail: (...a: unknown[]) => (sendEmail as unknown as (...x: unknown[]) => unknown)(...a) }));

import { opsAlertDedup, sendOpsAlertEmail } from "./ops-alert-email";

const T0 = Date.parse("2026-10-20T03:00:00Z");
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ops-alert-ts-"));
  sendEmail.mockClear();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("sendOpsAlertEmail", () => {
  it("without dedup sends every time (business notifications)", async () => {
    const stateFile = join(dir, "s.json");
    for (let i = 0; i < 3; i++) await expect(sendOpsAlertEmail({ to: "a@b.c", subject: "[blockid ops] New lead", text: "x", stateFile, now: T0 + i })).resolves.toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
  it("with dedup: first P2 of the day is sent, repeats are held (still true)", async () => {
    const stateFile = join(dir, "s.json");
    const args = { to: "a@b.c", subject: "[blockid ops] ⚠️ Cron Failed: /api/cron/x", text: "timeout", dedup: true, stateFile };
    await expect(sendOpsAlertEmail({ ...args, now: T0 })).resolves.toBe(true);
    await expect(sendOpsAlertEmail({ ...args, now: T0 + 600_000 })).resolves.toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    await sendOpsAlertEmail({ ...args, now: T0 + 24 * 3_600_000 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it("with dedup: P1 is never held", async () => {
    const stateFile = join(dir, "s.json");
    for (let i = 0; i < 3; i++) await sendOpsAlertEmail({ to: "a@b.c", subject: "[blockid ops] Stripe webhook failing", text: "", dedup: true, stateFile, now: T0 + i });
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
  it("opsAlertDedup reports the level/kind it decided on", () => {
    const v = opsAlertDedup({ subject: "[blockid ops] x failed", text: "", stateFile: join(dir, "s.json"), now: T0 });
    expect(v).toMatchObject({ send: true, level: "P2", reason: "first_today" });
    expect(v.kind).toBe("x failed");
  });
});
