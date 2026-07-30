// Tests for enforceConsent — colocated with the helper.
//
// Master Upgrade Plan §9.4 (consent domain) — Stage 4 Batch E sub-task E4.
//
// Coverage:
//   * pure decision predicate (happy, expired, revoked, recipient-mismatch,
//     public/link kinds bypass recipient check)
//   * enforceConsent integration with a mocked Supabase client:
//       - happy path — 200-shape, telemetry incremented, event appended
//       - expired    — 410, no event, no telemetry write
//       - revoked    — 403, no event
//       - recipient mismatch — 403, no event
//       - first-access sets first_accessed_at
//   * privacy invariant — consent_state_events.metadata contains NO PII
//     (no full user-agent, no IP, no recipient email, no watermark)

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getSupabaseAdminMock = vi.fn(() => null as unknown);
vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { enforceConsent } from "./enforce";
import { decideConsentAccess } from "./enforce-logic";

// ---------------------------------------------------------------------------
// Pure predicate — no Supabase mocking required.
// ---------------------------------------------------------------------------
describe("decideConsentAccess — pure predicate", () => {
  const base = {
    expires_at: null,
    revoked_at: null,
    onward_share_prohibited: true,
    recipient_kind: "email" as const,
    recipient_id: "partner@example.com",
    viewer_recipient: "partner@example.com",
  };

  it("allows a live consent with matching recipient", () => {
    expect(decideConsentAccess(base)).toEqual({ ok: true });
  });

  it("returns 410 when expires_at is in the past", () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const result = decideConsentAccess({
      ...base,
      expires_at: "2026-07-29T12:00:00Z",
      now,
    });
    expect(result).toEqual({
      ok: false,
      status: 410,
      reason: "consent_expired",
    });
  });

  it("returns 410 exactly at the expiry boundary (>= is expired)", () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const result = decideConsentAccess({
      ...base,
      expires_at: "2026-07-30T12:00:00Z",
      now,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(410);
  });

  it("returns 403 when revoked_at is set", () => {
    const result = decideConsentAccess({
      ...base,
      revoked_at: "2026-07-30T10:00:00Z",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: "consent_revoked",
    });
  });

  it("checks expiry BEFORE revoke (410 wins over 403)", () => {
    const now = new Date("2026-07-30T12:00:00Z");
    const result = decideConsentAccess({
      ...base,
      expires_at: "2026-07-29T12:00:00Z",
      revoked_at: "2026-07-29T11:00:00Z",
      now,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(410);
  });

  it("returns 403 when viewer_recipient does not match (email kind)", () => {
    const result = decideConsentAccess({
      ...base,
      viewer_recipient: "someone-else@example.com",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("normalises case + whitespace on recipient match", () => {
    const result = decideConsentAccess({
      ...base,
      viewer_recipient: "  Partner@Example.com  ",
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns 403 when onward-share-prohibited email consent has no viewer_recipient", () => {
    const result = decideConsentAccess({
      ...base,
      viewer_recipient: undefined,
    });
    expect(result.ok).toBe(false);
  });

  it("does NOT enforce recipient match for kind='public'", () => {
    const result = decideConsentAccess({
      ...base,
      recipient_kind: "public",
      recipient_id: null,
      viewer_recipient: undefined,
    });
    expect(result).toEqual({ ok: true });
  });

  it("does NOT enforce recipient match for kind='link'", () => {
    const result = decideConsentAccess({
      ...base,
      recipient_kind: "link",
      recipient_id: null,
      viewer_recipient: undefined,
    });
    expect(result).toEqual({ ok: true });
  });

  it("does NOT enforce recipient match when onward_share_prohibited=false", () => {
    const result = decideConsentAccess({
      ...base,
      onward_share_prohibited: false,
      viewer_recipient: undefined,
    });
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// enforceConsent — integration with mocked Supabase.
// ---------------------------------------------------------------------------

type FakeResult = {
  data: unknown;
  error: unknown;
};

type FakeConfig = {
  sharePackage?: FakeResult;
  consent?: FakeResult;
  updateResult?: FakeResult;
  insertResult?: FakeResult;
};

type CallLog = {
  selects: Array<{ table: string; eqField: string; eqValue: unknown }>;
  updates: Array<{ table: string; payload: unknown; eqValue: unknown }>;
  inserts: Array<{ table: string; payload: unknown }>;
};

function makeFakeSupabase(cfg: FakeConfig): {
  client: unknown;
  log: CallLog;
} {
  const log: CallLog = { selects: [], updates: [], inserts: [] };

  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(field: string, value: unknown) {
              return {
                async maybeSingle() {
                  log.selects.push({ table, eqField: field, eqValue: value });
                  if (table === "share_packages") {
                    return (
                      cfg.sharePackage ?? { data: null, error: null }
                    );
                  }
                  if (table === "consents") {
                    return cfg.consent ?? { data: null, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        update(payload: unknown) {
          return {
            async eq(_field: string, value: unknown) {
              log.updates.push({ table, payload, eqValue: value });
              return cfg.updateResult ?? { data: null, error: null };
            },
          };
        },
        async insert(payload: unknown) {
          log.inserts.push({ table, payload });
          return cfg.insertResult ?? { data: null, error: null };
        },
      };
    },
  };

  return { client, log };
}

const PKG_ROW = {
  id: "pkg-1",
  business_id: "biz-1",
  owner_user_id: "user-1",
  consent_id: "cons-1",
  share_token: "tok-abcdef",
  report_order_id: null,
  included_resources: [],
  watermark: "partner@example.com",
  access_count: 3,
  first_accessed_at: "2026-07-29T10:00:00Z",
  last_accessed_at: "2026-07-29T10:00:00Z",
  created_at: "2026-07-28T10:00:00Z",
};

const LIVE_CONSENT = {
  id: "cons-1",
  expires_at: "2027-01-01T00:00:00Z",
  revoked_at: null,
  onward_share_prohibited: true,
  recipient_kind: "email",
  recipient_id: "partner@example.com",
};

describe("enforceConsent — DB integration", () => {
  beforeEach(() => {
    getSupabaseAdminMock.mockReset();
  });

  it("fails closed (403) when Supabase admin client is unavailable", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const r = await enforceConsent("any", { recipient: "x@x" });
    expect(r).toEqual({ ok: false, status: 403 });
  });

  it("returns 403 when share_token does not resolve", async () => {
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: null, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);
    const r = await enforceConsent("nope", { recipient: "x@x" });
    expect(r).toEqual({ ok: false, status: 403 });
    // Only the share_packages lookup ran.
    expect(log.selects.map((s) => s.table)).toEqual(["share_packages"]);
    expect(log.updates).toHaveLength(0);
    expect(log.inserts).toHaveLength(0);
  });

  it("happy path — increments access_count, updates last_accessed_at, appends viewed event", async () => {
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: PKG_ROW, error: null },
      consent: { data: LIVE_CONSENT, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {
      recipient: "partner@example.com",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      ip: "203.0.113.9",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.sharePackage.id).toBe("pkg-1");
    expect(r.sharePackage.access_count).toBe(4);
    expect(r.sharePackage.last_accessed_at).not.toBe(
      PKG_ROW.last_accessed_at,
    );

    // Both lookups happened.
    expect(log.selects.map((s) => s.table)).toEqual([
      "share_packages",
      "consents",
    ]);

    // Telemetry update on share_packages.
    expect(log.updates).toHaveLength(1);
    const upd = log.updates[0];
    expect(upd.table).toBe("share_packages");
    expect(upd.eqValue).toBe("pkg-1");
    expect((upd.payload as { access_count: number }).access_count).toBe(4);

    // Viewed event appended to consent_state_events.
    expect(log.inserts).toHaveLength(1);
    const ins = log.inserts[0];
    expect(ins.table).toBe("consent_state_events");
    const payload = ins.payload as {
      consent_id: string;
      event_type: string;
      actor_user_id: unknown;
      metadata: Record<string, unknown>;
    };
    expect(payload.consent_id).toBe("cons-1");
    expect(payload.event_type).toBe("viewed");
    expect(payload.actor_user_id).toBeNull();

    // PII invariant — metadata must NOT leak identifying data.
    const metadataJson = JSON.stringify(payload.metadata).toLowerCase();
    expect(metadataJson).not.toContain("partner@example.com");
    expect(metadataJson).not.toContain("mozilla/5.0");
    expect(metadataJson).not.toContain("mac os");
    expect(metadataJson).not.toContain("203.0.113.9");
    // But a coarse bucket is fine and expected.
    expect(payload.metadata.ua_bucket).toBe("desktop");
  });

  it("first-access sets first_accessed_at when previously null", async () => {
    const virginPkg = {
      ...PKG_ROW,
      access_count: 0,
      first_accessed_at: null,
      last_accessed_at: null,
    };
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: virginPkg, error: null },
      consent: { data: LIVE_CONSENT, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {
      recipient: "partner@example.com",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");

    const upd = log.updates[0];
    const payload = upd.payload as {
      access_count: number;
      first_accessed_at: string;
      last_accessed_at: string;
    };
    expect(payload.access_count).toBe(1);
    // Both timestamps should be set to the same "now" value.
    expect(payload.first_accessed_at).toBe(payload.last_accessed_at);
    expect(typeof payload.first_accessed_at).toBe("string");

    if (!r.ok) throw new Error("unreachable");
    expect(r.sharePackage.first_accessed_at).toBe(payload.first_accessed_at);
  });

  it("expired consent — 410 Gone, no telemetry, no event", async () => {
    const expired = {
      ...LIVE_CONSENT,
      expires_at: "2020-01-01T00:00:00Z",
    };
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: PKG_ROW, error: null },
      consent: { data: expired, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {
      recipient: "partner@example.com",
    });
    expect(r).toEqual({ ok: false, status: 410 });
    expect(log.updates).toHaveLength(0);
    expect(log.inserts).toHaveLength(0);
  });

  it("revoked consent — 403 Forbidden, no telemetry, no event", async () => {
    const revoked = {
      ...LIVE_CONSENT,
      revoked_at: "2026-07-01T00:00:00Z",
    };
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: PKG_ROW, error: null },
      consent: { data: revoked, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {
      recipient: "partner@example.com",
    });
    expect(r).toEqual({ ok: false, status: 403 });
    expect(log.updates).toHaveLength(0);
    expect(log.inserts).toHaveLength(0);
  });

  it("recipient mismatch — 403, no telemetry, no event", async () => {
    const { client, log } = makeFakeSupabase({
      sharePackage: { data: PKG_ROW, error: null },
      consent: { data: LIVE_CONSENT, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {
      recipient: "attacker@evil.example",
    });
    expect(r).toEqual({ ok: false, status: 403 });
    expect(log.updates).toHaveLength(0);
    expect(log.inserts).toHaveLength(0);
  });

  it("public consent — allows access with no viewer_recipient", async () => {
    const publicConsent = {
      ...LIVE_CONSENT,
      recipient_kind: "public",
      recipient_id: null,
    };
    const { client } = makeFakeSupabase({
      sharePackage: { data: PKG_ROW, error: null },
      consent: { data: publicConsent, error: null },
    });
    getSupabaseAdminMock.mockReturnValue(client);

    const r = await enforceConsent("tok-abcdef", {});
    expect(r.ok).toBe(true);
  });
});
