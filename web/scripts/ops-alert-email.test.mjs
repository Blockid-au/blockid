import { describe, expect, it } from "vitest";
import { shouldSend, sendOpsEmail } from "./ops-alert-email.mjs";

describe("ops-alert-email (G15 review: Telegram token is 401 → e-mail fallback)", () => {
  it("allows up to 30 mails per rolling hour, then drops", () => {
    const now = 1_700_000_000_000;
    let state = { sent_at: [] };
    for (let i = 0; i < 30; i++) { const r = shouldSend(state, now + i * 1000); expect(r.ok).toBe(true); state = r.next; }
    expect(shouldSend(state, now + 31_000).ok).toBe(false);
    // an hour later the window has rolled
    expect(shouldSend(state, now + 3_600_001 + 31_000).ok).toBe(true);
  });
  it("is not_configured without ADMIN_EMAIL/SMTP and dry_run never sends", async () => {
    expect((await sendOpsEmail("s", "b", { env: {}, webDir: "/nonexistent-webdir" })).reason).toBe("not_configured");
    const r = await sendOpsEmail("s", "b", { env: { ADMIN_EMAIL: "a@b.c", SMTP_USER: "u", SMTP_PASS: "p" }, dryRun: true, webDir: "/nonexistent-webdir" });
    expect(r).toEqual({ sent: false, reason: "dry_run", to: "a@b.c" });
  });
});
