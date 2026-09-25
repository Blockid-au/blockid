// G34-BT2 EM05 — recordMarketingConsent: express opt-in from an unticked box.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const updates: Array<{ payload: Record<string, unknown>; eq: [string, unknown] | null }> = [];
const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
let updateErrors: Array<unknown> = [];
let configured = true;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () =>
    configured
      ? {
          from: (table: string) => ({
            update: (payload: Record<string, unknown>) => ({
              eq: (k: string, v: unknown) => {
                updates.push({ payload, eq: [k, v] });
                return Promise.resolve({ error: updateErrors.shift() ?? null });
              },
            }),
            insert: (payload: Record<string, unknown>) => {
              inserts.push({ table, payload });
              return { select: () => ({ single: async () => ({ data: { id: "c-1" }, error: null }) }) };
            },
          }),
        }
      : null,
}));
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn(async () => ({})) }));

const ensureMock = vi.fn(async (_e: string, _u?: string) => "tok");
vi.mock("./email-preferences", () => ({
  ensureEmailPreferences: (e: string, u?: string) => ensureMock(e, u),
  commercialPreferenceDefaults: (g: boolean) => ({ weekly_reports: g, product_updates: g, promotions: g, digest_weekly: g }),
}));

import { hashDisclaimerBody, recordMarketingConsent } from "./consent";
import { MARKETING_CONSENT_LABEL, MARKETING_CONSENT_VERSION } from "./email/marketing-consent-copy";

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
  updateErrors = [];
  configured = true;
  vi.clearAllMocks();
});

describe("recordMarketingConsent", () => {
  it("an unticked box writes nothing (new rows stay commercial-off)", async () => {
    expect(await recordMarketingConsent({ email: "a@b.co", granted: false, method: "register_password" })).toBe(false);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("a ticked guest box turns the commercial categories on and stamps method + version", async () => {
    expect(await recordMarketingConsent({ email: " Guest@B.co ", granted: true, method: "analyze_guest_email" })).toBe(true);
    expect(ensureMock).toHaveBeenCalledWith("guest@b.co", undefined);
    expect(updates[0].eq).toEqual(["email", "guest@b.co"]);
    expect(updates[0].payload).toMatchObject({
      promotions: true,
      product_updates: true,
      weekly_reports: true,
      digest_weekly: true,
      marketing_consent_method: "analyze_guest_email",
      marketing_consent_version: MARKETING_CONSENT_VERSION,
    });
    expect(typeof updates[0].payload.marketing_consent_at).toBe("string");
    // A guest has no user id → no consent_events row.
    expect(inserts).toHaveLength(0);
  });

  it("an account also gets a consent_events row naming the exact wording", async () => {
    await recordMarketingConsent({ email: "a@b.co", userId: "u-1", granted: true, method: "signup_card", ip: "1.2.3.4", ua: "UA" });
    const row = inserts.find((i) => i.table === "consent_events")!.payload;
    expect(row).toMatchObject({
      user_id: "u-1",
      consent_kind: "marketing",
      disclaimer_version: MARKETING_CONSENT_VERSION,
      disclaimer_hash: hashDisclaimerBody(MARKETING_CONSENT_LABEL),
      granted: true,
      jurisdiction: "AU",
      detail: { method: "signup_card" },
    });
  });

  it("before 0465 the consent stamp is dropped but the categories still update", async () => {
    updateErrors = [{ code: "42703", message: "column marketing_consent_at does not exist" }];
    expect(await recordMarketingConsent({ email: "a@b.co", granted: true, method: "register_password" })).toBe(true);
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).not.toHaveProperty("marketing_consent_at");
  });

  it("never throws when the database is unavailable", async () => {
    configured = false;
    await expect(recordMarketingConsent({ email: "a@b.co", userId: "u", granted: true, method: "signup_card" })).resolves.toBe(false);
  });
});
