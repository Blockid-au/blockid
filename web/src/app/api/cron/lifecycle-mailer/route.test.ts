// G34-BT2 EM01 — lifecycle-mailer is retired: unscheduled in
// scripts/crontab.production and answering `{ retired: true }` after the auth
// gate. It must never read lifecycle_state or reach the transport again.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const sendEmailMock = vi.fn();
const loadDueMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (a: unknown) => sendEmailMock(a) }));
vi.mock("@/lib/conversion/lifecycle", () => ({
  loadDue: (n: number) => loadDueMock(n),
  advance: vi.fn(),
}));
vi.mock("@/lib/conversion/experiments", () => ({ assign: vi.fn() }));
vi.mock("@/lib/conversion/triggers", () => ({ shouldFire: vi.fn(), recordConversionEvent: vi.fn() }));
vi.mock("@/emails/lifecycle/render", () => ({ renderLifecycleEmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({}),
  isSupabaseConfigured: () => true,
}));

import { GET, POST } from "./route";

const SECRET = "cron-secret-lifecycle-mailer";

beforeEach(() => {
  sendEmailMock.mockReset();
  loadDueMock.mockReset();
  process.env.CRON_SECRET = SECRET;
});

describe("/api/cron/lifecycle-mailer — retired (G34-BT2 EM01)", () => {
  it("rejects an unauthorised caller", async () => {
    const res = await GET(new Request("http://x/api/cron/lifecycle-mailer"));
    expect(res.status).toBe(401);
  });

  it("answers retired without loading due rows or sending", async () => {
    const res = await POST(
      new Request("http://x/api/cron/lifecycle-mailer", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, retired: true, processed: 0 });
    expect(loadDueMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("is not scheduled in crontab.production (nor are the other retired mailers)", () => {
    const cron = readFileSync(path.resolve(__dirname, "../../../../../scripts/crontab.production"), "utf8");
    const active = cron.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    for (const job of ["lifecycle-mailer", "svi-notify", "nurture", "nurture-emails", "onboarding-sequence"]) {
      expect(active.filter((l) => new RegExp(`\\$RUN ${job}(\\s|$)`).test(l))).toEqual([]);
    }
    // The one engine stays scheduled.
    expect(active.some((l) => /\$RUN email-drip(\s|$)/.test(l))).toBe(true);
  });
});
