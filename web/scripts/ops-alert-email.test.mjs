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

describe("ops-alert-email — O1 / L1-12 dedup + digest", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { sendOpsDigest, parseCli } = await import("./ops-alert-email.mjs");
  const env = { ADMIN_EMAIL: "ops@example.com", SMTP_USER: "u", SMTP_PASS: "p" };
  const T0 = Date.parse("2026-10-20T03:00:00Z");
  function harness() {
    const dir = mkdtempSync(join(tmpdir(), "ops-alert-email-"));
    const mails = [];
    const transport = { sendMail: async (m) => { mails.push(m); return { messageId: "x" }; } };
    const opts = { env, webDir: "/nonexistent-webdir", transport, dedupStateFile: join(dir, "dedup.json"), rateStateFile: join(dir, "rate.json") };
    return { dir, mails, opts, done: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("sends the first P2 of the day, holds its repeats, digests them after midnight", async () => {
    const h = harness();
    try {
      const r1 = await sendOpsEmail("Cron failed: /api/cron/x", "timeout", { ...h.opts, now: T0 });
      expect(r1).toMatchObject({ sent: true, level: "P2" });
      const r2 = await sendOpsEmail("Cron failed: /api/cron/x", "timeout", { ...h.opts, now: T0 + 600_000 });
      expect(r2).toMatchObject({ sent: false, reason: "dedup_held_for_digest", level: "P2" });
      await sendOpsEmail("Cron failed: /api/cron/x", "timeout", { ...h.opts, now: T0 + 1_200_000 });
      expect(h.mails).toHaveLength(1);
      expect(h.mails[0].subject).toBe("[blockid ops] Cron failed: /api/cron/x");
      const d = await sendOpsDigest({ ...h.opts, now: T0 + 22 * 3_600_000 });
      expect(d).toEqual({ sent: 1, days: ["2026-10-20"] });
      expect(h.mails[1].subject).toContain("Ops digest 2026-10-20: 2 repeated P2 alerts held");
      expect((await sendOpsDigest({ ...h.opts, now: T0 + 23 * 3_600_000 })).sent).toBe(0);
    } finally { h.done(); }
  });

  it("P0/P1 always go out immediately, tagged in the subject", async () => {
    const h = harness();
    try {
      for (let i = 0; i < 3; i++) expect((await sendOpsEmail("DB backup failed", "pg_dump exit 1", { ...h.opts, now: T0 + i })).sent).toBe(true);
      expect((await sendOpsEmail("weird", "", { ...h.opts, level: "P0", now: T0 })).sent).toBe(true);
      expect(h.mails).toHaveLength(4);
      expect(h.mails[0].subject).toBe("[blockid ops] [P1] DB backup failed");
      expect(h.mails[3].subject).toBe("[blockid ops] [P0] weird");
    } finally { h.done(); }
  });

  it("the 30/h storm cap still applies after dedup", async () => {
    const h = harness();
    try {
      for (let i = 0; i < 32; i++) await sendOpsEmail(`Restore drill step ${String.fromCharCode(97 + (i % 26))}${i} failed`, "", { ...h.opts, level: "P1", now: T0 + i });
      expect(h.mails).toHaveLength(30);
    } finally { h.done(); }
  });

  it("parseCli reads --level / --digest / --dry-run and positional subject+body", () => {
    expect(parseCli(["--level", "p1", "Subj", "Body"])).toMatchObject({ subject: "Subj", body: "Body", level: "P1", digest: false });
    expect(parseCli(["--level=P0", "S"])).toMatchObject({ subject: "S", body: undefined, level: "P0" });
    expect(parseCli(["--digest", "--dry-run"])).toMatchObject({ digest: true, dryRun: true });
  });
});
