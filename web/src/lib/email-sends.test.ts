// G34-BT2 — send log (EM02), C-class frequency cap (EM03), suppression
// (EM04), consent (EM05) and the one-click unsubscribe URL (EM06).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

type Resp = { data?: unknown; error?: unknown };
interface Call {
  table: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  gte: Array<[string, unknown]>;
}

const state: { configured: boolean; throwOn: string | null; queue: Resp[]; calls: Call[] } = {
  configured: true,
  throwOn: null,
  queue: [],
  calls: [],
};

function chain(table: string) {
  if (state.throwOn === table) throw new Error("boom");
  const call: Call = { table, op: "select", eqs: [], gte: [] };
  state.calls.push(call);
  const next = () => {
    const r = state.queue.shift() ?? {};
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  };
  const c: Record<string, unknown> = {
    select: () => c,
    insert: (p: Record<string, unknown>) => ((call.op = "insert"), (call.payload = p), c),
    update: (p: Record<string, unknown>) => ((call.op = "update"), (call.payload = p), c),
    eq: (k: string, v: unknown) => (call.eqs.push([k, v]), c),
    gte: (k: string, v: unknown) => (call.gte.push([k, v]), c),
    maybeSingle: next,
    then: (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => next().then(f, r),
  };
  return c;
}

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => (state.configured ? { from: (t: string) => chain(t) } : null),
}));

import {
  COMMERCIAL_FREQUENCY_CAP,
  MARKETING_CONSENT_CUTOFF,
  checkCommercialFrequencyCap,
  commercialSendGate,
  emailSendRow,
  evaluateFrequencyCap,
  getSuppression,
  hasCommercialConsent,
  hashRecipient,
  oneClickUnsubscribeUrl,
  recordEmailSend,
  suppressRecipient,
  toOneClickUnsubscribeUrl,
} from "./email-sends";

beforeEach(() => {
  state.configured = true;
  state.throwOn = null;
  state.queue = [];
  state.calls = [];
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

const NOW = new Date("2026-09-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("EM02 — send log row", () => {
  it("hashes the lower-cased, trimmed address and never stores it raw", () => {
    const row = emailSendRow({ to: "  Founder@Example.COM ", emailClass: "C", flow: "lead-nurture", template: "lead_d1", providerMessageId: "m1", status: "sent" });
    expect(row.recipient_hash).toBe(createHash("sha256").update("founder@example.com").digest("hex"));
    expect(hashRecipient("A@B.co")).toBe(hashRecipient(" a@b.co "));
    expect(JSON.stringify(row)).not.toMatch(/example\.com/i);
    expect(row).toMatchObject({ flow: "lead-nurture", class: "C", template: "lead_d1", provider_message_id: "m1", status: "sent" });
  });

  it("recordEmailSend inserts into email_sends and tolerates a missing table", async () => {
    state.queue.push({ error: { code: "42P01", message: "relation email_sends does not exist" } });
    await expect(recordEmailSend({ to: "a@b.co", emailClass: "T", status: "sent" })).resolves.toBeUndefined();
    expect(state.calls[0]).toMatchObject({ table: "email_sends", op: "insert" });
    expect(state.calls[0].payload).toMatchObject({ flow: "unspecified", class: "T" });
  });

  it("recordEmailSend never throws, even when the client throws or is absent", async () => {
    state.throwOn = "email_sends";
    await expect(recordEmailSend({ to: "a@b.co", emailClass: "C", status: "failed" })).resolves.toBeUndefined();
    state.configured = false;
    await expect(recordEmailSend({ to: "a@b.co", emailClass: "C", status: "failed" })).resolves.toBeUndefined();
  });
});

describe("EM03 — frequency cap", () => {
  it("pins the founder's numbers: 1/day, 3/7 days, 1 per flow per 72 h", () => {
    expect(COMMERCIAL_FREQUENCY_CAP).toEqual({ perDay: 1, perWeek: 3, perFlowHours: 72 });
  });

  it("allows the first commercial send", () => {
    expect(evaluateFrequencyCap([], "digest", NOW)).toEqual({ ok: true });
  });

  it("blocks a second send inside 24 h", () => {
    expect(evaluateFrequencyCap([{ created_at: hoursAgo(23), flow: "other" }], "digest", NOW)).toEqual({ ok: false, reason: "cap_day" });
    expect(evaluateFrequencyCap([{ created_at: hoursAgo(25), flow: "other" }], "digest", NOW)).toEqual({ ok: true });
  });

  it("blocks a fourth send inside 7 days", () => {
    const rows = [30, 60, 100].map((h, i) => ({ created_at: hoursAgo(h), flow: `f${i}` }));
    expect(evaluateFrequencyCap(rows, "digest", NOW)).toEqual({ ok: false, reason: "cap_week" });
    expect(evaluateFrequencyCap(rows.slice(0, 2), "digest", NOW)).toEqual({ ok: true });
  });

  it("blocks the same flow inside 72 h but not after", () => {
    expect(evaluateFrequencyCap([{ created_at: hoursAgo(50), flow: "digest" }], "digest", NOW)).toEqual({ ok: false, reason: "cap_flow" });
    expect(evaluateFrequencyCap([{ created_at: hoursAgo(50), flow: "other" }], "digest", NOW)).toEqual({ ok: true });
    expect(evaluateFrequencyCap([{ created_at: hoursAgo(73), flow: "digest" }], "digest", NOW)).toEqual({ ok: true });
  });

  it("reads only sent C-class rows of the last 7 days for the hashed recipient", async () => {
    state.queue.push({ data: [] });
    expect(await checkCommercialFrequencyCap("A@B.co", "digest", NOW)).toEqual({ ok: true });
    const call = state.calls[0];
    expect(call.table).toBe("email_sends");
    expect(call.eqs).toEqual([
      ["recipient_hash", hashRecipient("a@b.co")],
      ["class", "C"],
      ["status", "sent"],
    ]);
    expect(call.gte).toEqual([["created_at", hoursAgo(7 * 24)]]);
  });

  it("fails CLOSED when the log cannot be read (table missing, no client, thrown chain)", async () => {
    state.queue.push({ error: { code: "42P01" } });
    expect(await checkCommercialFrequencyCap("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "log_unavailable" });
    state.throwOn = "email_sends";
    expect(await checkCommercialFrequencyCap("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "log_unavailable" });
    state.throwOn = null;
    state.configured = false;
    expect(await checkCommercialFrequencyCap("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "log_unavailable" });
  });
});

describe("EM04 — suppression", () => {
  it("reads suppressed_reason; unreadable before 0465 is applied", async () => {
    state.queue.push({ data: { suppressed_reason: "hard_bounce" } });
    expect(await getSuppression("a@b.co")).toEqual({ readable: true, reason: "hard_bounce" });
    state.queue.push({ data: null });
    expect(await getSuppression("a@b.co")).toEqual({ readable: true, reason: null });
    state.queue.push({ error: { code: "42703", message: "column suppressed_reason does not exist" } });
    expect(await getSuppression("a@b.co")).toEqual({ readable: false, reason: null });
  });

  it("suppressRecipient turns every commercial category off and stamps the reason", async () => {
    state.queue.push({ data: { email: "a@b.co" } }); // existing row
    state.queue.push({}); // update ok
    expect(await suppressRecipient(" A@B.co ", "complaint")).toBe(true);
    const upd = state.calls[1];
    expect(upd.op).toBe("update");
    expect(upd.eqs).toEqual([["email", "a@b.co"]]);
    expect(upd.payload).toMatchObject({
      unsubscribed_all: true,
      promotions: false,
      product_updates: false,
      weekly_reports: false,
      digest_weekly: false,
      suppressed_reason: "complaint",
    });
  });

  it("falls back to the pre-0465 columns so commercial mail still stops", async () => {
    state.queue.push({ data: { email: "a@b.co" } });
    state.queue.push({ error: { code: "42703" } }); // suppressed_* missing
    state.queue.push({}); // base update ok
    expect(await suppressRecipient("a@b.co", "hard_bounce")).toBe(true);
    expect(state.calls[2].payload).not.toHaveProperty("suppressed_reason");
    expect(state.calls[2].payload).toMatchObject({ unsubscribed_all: true });
  });

  it("creates the preference row when the address has none", async () => {
    state.queue.push({ data: null });
    state.queue.push({});
    expect(await suppressRecipient("new@b.co", "hard_bounce")).toBe(true);
    expect(state.calls[1]).toMatchObject({ op: "insert" });
    expect(state.calls[1].payload).toMatchObject({ email: "new@b.co", suppressed_reason: "hard_bounce" });
  });
});

describe("EM05 — consent (D24-e)", () => {
  it("an account created before the cut-over keeps inferred consent", async () => {
    state.queue.push({ data: { created_at: "2026-01-01T00:00:00Z" } });
    expect(await hasCommercialConsent("old@b.co")).toBe(true);
    expect(state.calls).toHaveLength(1);
  });

  it("a new account needs express consent", async () => {
    state.queue.push({ data: { created_at: MARKETING_CONSENT_CUTOFF } });
    state.queue.push({ data: { marketing_consent_at: null } });
    expect(await hasCommercialConsent("new@b.co")).toBe(false);
    state.queue.push({ data: { created_at: "2026-09-26T00:00:00Z" } });
    state.queue.push({ data: { marketing_consent_at: "2026-09-26T01:00:00Z" } });
    expect(await hasCommercialConsent("new@b.co")).toBe(true);
  });

  it("a guest who only typed an address for the free report gets no commercial mail", async () => {
    state.queue.push({ data: null }); // no app_users row
    state.queue.push({ data: { marketing_consent_at: null } });
    expect(await hasCommercialConsent("guest@b.co")).toBe(false);
  });

  it("fails closed when the consent column is missing (0465 not applied)", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: { code: "42703" } });
    expect(await hasCommercialConsent("guest@b.co")).toBe(false);
    state.configured = false;
    expect(await hasCommercialConsent("guest@b.co")).toBe(false);
  });
});

describe("commercialSendGate", () => {
  it("passes when not suppressed, consented and under the cap", async () => {
    state.queue.push({ data: { suppressed_reason: null } });
    state.queue.push({ data: { created_at: "2025-01-01T00:00:00Z" } });
    state.queue.push({ data: [] });
    expect(await commercialSendGate("a@b.co", "digest", NOW)).toEqual({ ok: true });
  });

  it("stops at each failing step, in order", async () => {
    state.queue.push({ error: { code: "42703" } });
    expect(await commercialSendGate("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "suppression_unreadable" });

    state.queue.push({ data: { suppressed_reason: "complaint" } });
    expect(await commercialSendGate("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "suppressed", detail: "complaint" });

    state.queue.push({ data: null });
    state.queue.push({ data: null });
    state.queue.push({ data: null });
    expect(await commercialSendGate("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "no_consent" });

    state.queue.push({ data: null });
    state.queue.push({ data: { created_at: "2025-01-01T00:00:00Z" } });
    state.queue.push({ data: [{ created_at: hoursAgo(2), flow: "x" }] });
    expect(await commercialSendGate("a@b.co", "digest", NOW)).toEqual({ ok: false, reason: "frequency_capped", detail: "cap_day" });
  });
});

describe("EM06 — one-click unsubscribe URL", () => {
  it("points at the API route with the token (and category)", () => {
    expect(oneClickUnsubscribeUrl("tok")).toBe("https://blockid.au/api/unsubscribe?token=tok");
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au/";
    expect(oneClickUnsubscribeUrl("tok", "promotions")).toBe("https://staging.blockid.au/api/unsubscribe?token=tok&category=promotions");
  });

  it("maps the confirmation-page link onto the API route; token-less links cannot one-click", () => {
    expect(toOneClickUnsubscribeUrl("https://blockid.au/unsubscribe?token=t1&category=weekly_reports")).toBe(
      "https://blockid.au/api/unsubscribe?token=t1&category=weekly_reports",
    );
    expect(toOneClickUnsubscribeUrl("https://blockid.au/api/unsubscribe?token=t1")).toBe("https://blockid.au/api/unsubscribe?token=t1");
    expect(toOneClickUnsubscribeUrl("https://blockid.au/unsubscribe?email=a%40b.co")).toBeNull();
    expect(toOneClickUnsubscribeUrl("https://blockid.au/account/unsubscribe?u=1")).toBeNull();
    expect(toOneClickUnsubscribeUrl("not a url")).toBeNull();
  });
});
