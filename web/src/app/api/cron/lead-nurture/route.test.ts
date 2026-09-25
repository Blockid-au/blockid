// G34-BT2 — lead-nurture filters BEFORE limiting (EM01) and passes every
// step through the commercial checklist (EM03).

import { describe, it, expect, vi, beforeEach } from "vitest";

const d1 = vi.fn();
const d4 = vi.fn();
const d9 = vi.fn();
vi.mock("@/lib/email", () => ({
  sendD1Welcome: (a: unknown) => d1(a),
  sendD4CheckIn: (a: unknown) => d4(a),
  sendD9LastCall: (a: unknown) => d9(a),
}));

const checklistMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  emailSendChecklist: (...a: unknown[]) => checklistMock(...a),
}));

let accounts: Array<Record<string, unknown>> = [];
const inserts: unknown[] = [];
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "svi_accounts") {
        const c = { select: () => c, order: () => Promise.resolve({ data: accounts, error: null }) };
        return c;
      }
      return { insert: (row: unknown) => (inserts.push(row), Promise.resolve({ error: null })) };
    },
  }),
}));

import { GET } from "./route";

const SECRET = "cron-lead-nurture";
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY - 3_600_000).toISOString();
const run = () => GET(new Request("http://x/api/cron/lead-nurture", { headers: { authorization: `Bearer ${SECRET}` } }));

beforeEach(() => {
  vi.clearAllMocks();
  inserts.length = 0;
  process.env.CRON_SECRET = SECRET;
  checklistMock.mockResolvedValue({ ok: true });
  for (const m of [d1, d4, d9]) m.mockResolvedValue({ ok: true, id: "m" });
});

describe("/api/cron/lead-nurture", () => {
  it("reaches a due account past the first 50 (newest-first) rows", async () => {
    accounts = [
      ...Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, email: `n${i}@x.io`, name: "N", created_at: daysAgo(0) })),
      { id: "due", email: "due@x.io", name: "Due", current_svi: 44, created_at: daysAgo(4) },
    ];
    const body = await (await run()).json();
    expect(body.sent).toBe(1);
    expect(d4).toHaveBeenCalledWith({ to: "due@x.io", name: "Due", svi: 44 });
    expect(checklistMock).toHaveBeenCalledWith("due@x.io", "promotions", "lead_d4", { flow: "lead-nurture" });
  });

  it("counts an opted-out address and never calls the sender", async () => {
    accounts = [{ id: "a", email: "a@x.io", name: "A", created_at: daysAgo(1) }];
    checklistMock.mockResolvedValueOnce({ ok: false, reason: "user_unsubscribed" });
    const body = await (await run()).json();
    expect(body).toMatchObject({ sent: 0, opted_out: 1 });
    expect(d1).not.toHaveBeenCalled();
  });

  it("skips a capped / consent-less address without recording it", async () => {
    accounts = [{ id: "a", email: "a@x.io", name: "A", created_at: daysAgo(1) }];
    checklistMock.mockResolvedValueOnce({ ok: false, reason: "no_consent" });
    const body = await (await run()).json();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
    expect(inserts).toHaveLength(0);
  });
});
