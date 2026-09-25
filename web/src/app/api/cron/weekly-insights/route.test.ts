// G34-BT2 — weekly-insights filters BEFORE limiting (EM01) and runs every
// send through the commercial checklist + C-class sendEmail (EM03).

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (a: unknown) => sendEmailMock(a) }));

const checklistMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  emailSendChecklist: (...a: unknown[]) => checklistMock(...a),
  ensureEmailPreferences: async () => "tok",
  getUnsubscribeUrl: (t: string, c?: string) => `https://blockid.au/unsubscribe?token=${t}${c ? `&category=${c}` : ""}`,
  getPreferencesUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}&manage=1`,
}));

let accounts: Array<Record<string, unknown>> = [];
const inserts: unknown[] = [];
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "svi_accounts") {
        const c = { select: () => c, not: () => Promise.resolve({ data: accounts, error: null }) };
        return c;
      }
      return { insert: (row: unknown) => (inserts.push(row), Promise.resolve({ error: null })) };
    },
  }),
}));

import { GET } from "./route";

const SECRET = "cron-weekly-insights";
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY - 3_600_000).toISOString();
const run = () => GET(new Request("http://x/api/cron/weekly-insights", { headers: { authorization: `Bearer ${SECRET}` } }));

beforeEach(() => {
  vi.clearAllMocks();
  inserts.length = 0;
  process.env.CRON_SECRET = SECRET;
  checklistMock.mockResolvedValue({ ok: true });
  sendEmailMock.mockResolvedValue({ ok: true, id: "m" });
});

describe("/api/cron/weekly-insights", () => {
  it("reaches a due account that sits past the first 20 rows (filter before limit)", async () => {
    accounts = [
      ...Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, email: `n${i}@x.io`, name: "N", current_svi: 50, created_at: daysAgo(2) })),
      { id: "due", email: "due@x.io", name: "Due Person", current_svi: 61, created_at: daysAgo(8) },
    ];
    const body = await (await run()).json();
    expect(body.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "due@x.io",
      emailClass: "C",
      flow: "weekly-insights",
      template: "follow_up_1w",
      category: "weekly_reports",
    });
    expect(checklistMock).toHaveBeenCalledWith("due@x.io", "weekly_reports", "follow_up_1w", { flow: "weekly-insights" });
    expect(inserts).toHaveLength(1);
  });

  it("a weekly run still catches an account 6 days into its window", async () => {
    accounts = [{ id: "a", email: "a@x.io", name: "A", current_svi: 40, created_at: daysAgo(36) }];
    const body = await (await run()).json();
    expect(body.sent).toBe(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe("follow_up_1m");
  });

  it("skips without recording when the checklist refuses (cap / consent / already sent)", async () => {
    accounts = [{ id: "a", email: "a@x.io", name: "A", current_svi: 40, created_at: daysAgo(8) }];
    checklistMock.mockResolvedValueOnce({ ok: false, reason: "frequency_capped" });
    const body = await (await run()).json();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("does not record a milestone the transport refused", async () => {
    accounts = [{ id: "a", email: "a@x.io", name: "A", current_svi: 40, created_at: daysAgo(8) }];
    sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "no_consent" });
    const body = await (await run()).json();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
    expect(inserts).toHaveLength(0);
  });

  it("bounds the SENDS of one run at 20", async () => {
    accounts = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, email: `d${i}@x.io`, name: "D", current_svi: 50, created_at: daysAgo(8) }));
    const body = await (await run()).json();
    expect(body.sent).toBe(20);
  });
});
