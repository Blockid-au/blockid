import { describe, it, expect } from "vitest";
import {
  decideConsentAccess,
  type ConsentDecisionInput,
  type ConsentDecision,
} from "./enforce-logic";

// enforce-logic.ts is the pure decision core of enforceConsent (share_package
// gating). Every DB-backed enforce path funnels through it, so a regression
// here is a live authorization bug — an expired token could return `ok:true`
// or a revoked one could leak past. The suite pins:
//   * ordering — expiry (410) checked BEFORE revoke (403) BEFORE recipient
//   * boundary semantics — expiry is `now >= expires_at` (strict, not >)
//   * recipient kinds — email/org/api_partner enforced; link/public open
//   * onward-share flag — false means no recipient enforcement even on mismatch
//   * normalization — case-insensitive + trimmed recipient compare
//   * default clock — `input.now` defaults to `new Date()` when omitted
//   * return shape — discriminated union { ok:true } | { ok:false, status, reason }

function base(overrides: Partial<ConsentDecisionInput> = {}): ConsentDecisionInput {
  return {
    expires_at: null,
    revoked_at: null,
    onward_share_prohibited: false,
    recipient_kind: "link",
    recipient_id: null,
    ...overrides,
  };
}

const NOW = new Date("2026-07-31T12:00:00.000Z");
const FUTURE = new Date("2027-01-01T00:00:00.000Z");
const PAST = new Date("2025-01-01T00:00:00.000Z");

describe("decideConsentAccess — expiry (410 Gone)", () => {
  it("returns ok when expires_at is null", () => {
    const out = decideConsentAccess(base({ now: NOW, expires_at: null }));
    expect(out).toEqual({ ok: true });
  });

  it("returns ok when expires_at is strictly in the future", () => {
    const out = decideConsentAccess(
      base({ now: NOW, expires_at: FUTURE.toISOString() }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("returns 410 consent_expired at the exact boundary (now === expires_at)", () => {
    // Boundary is now >= expires_at — an exact match must expire.
    const out = decideConsentAccess(
      base({ now: NOW, expires_at: NOW.toISOString() }),
    );
    expect(out).toEqual({ ok: false, status: 410, reason: "consent_expired" });
  });

  it("returns 410 consent_expired for any past expiry", () => {
    const out = decideConsentAccess(
      base({ now: NOW, expires_at: PAST.toISOString() }),
    );
    expect(out).toEqual({ ok: false, status: 410, reason: "consent_expired" });
  });

  it("expiry takes precedence over revocation (both set → 410, not 403)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        expires_at: PAST.toISOString(),
        revoked_at: PAST.toISOString(),
      }),
    );
    expect(out).toEqual({ ok: false, status: 410, reason: "consent_expired" });
  });

  it("expiry takes precedence over recipient mismatch (410 wins, not 403)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        expires_at: PAST.toISOString(),
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "eve@example.com",
      }),
    );
    expect(out).toEqual({ ok: false, status: 410, reason: "consent_expired" });
  });
});

describe("decideConsentAccess — revocation (403 Forbidden)", () => {
  it("returns 403 consent_revoked when revoked_at is set and expiry passes", () => {
    const out = decideConsentAccess(
      base({ now: NOW, revoked_at: PAST.toISOString() }),
    );
    expect(out).toEqual({ ok: false, status: 403, reason: "consent_revoked" });
  });

  it("returns 403 consent_revoked even when revoked_at is a future ISO (any non-empty string revokes)", () => {
    // The check is truthiness — a non-empty string is revoked regardless of when.
    const out = decideConsentAccess(
      base({ now: NOW, revoked_at: FUTURE.toISOString() }),
    );
    expect(out).toEqual({ ok: false, status: 403, reason: "consent_revoked" });
  });

  it("empty string revoked_at is falsy → not revoked", () => {
    // JS truthiness: "" is falsy, so an empty string does NOT trigger the branch.
    const out = decideConsentAccess(base({ now: NOW, revoked_at: "" as string | null }));
    expect(out).toEqual({ ok: true });
  });

  it("revocation takes precedence over recipient enforcement (403 revoked, not recipient_mismatch)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        revoked_at: PAST.toISOString(),
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "eve@example.com",
      }),
    );
    expect(out).toEqual({ ok: false, status: 403, reason: "consent_revoked" });
  });
});

describe("decideConsentAccess — recipient enforcement (onward_share_prohibited)", () => {
  it("no enforcement when onward_share_prohibited is false, even on obvious mismatch", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: false,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "eve@example.com",
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("kind=public is unrestricted (no viewer_recipient required)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "public",
        recipient_id: null,
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("kind=link is unrestricted (no viewer_recipient required)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "link",
        recipient_id: null,
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it.each<[ConsentDecisionInput["recipient_kind"]]>([
    ["email"],
    ["org"],
    ["api_partner"],
  ])("kind=%s permits a matching viewer_recipient", (kind) => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: kind,
        recipient_id: "alice@example.com",
        viewer_recipient: "alice@example.com",
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it.each<[ConsentDecisionInput["recipient_kind"]]>([
    ["email"],
    ["org"],
    ["api_partner"],
  ])("kind=%s returns 403 recipient_mismatch on a different viewer_recipient", (kind) => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: kind,
        recipient_id: "alice@example.com",
        viewer_recipient: "eve@example.com",
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("case-insensitive match — expected upper, asserted lower → OK", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "ALICE@EXAMPLE.COM",
        viewer_recipient: "alice@example.com",
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("whitespace-trimmed compare — pads around both sides → OK", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "  alice@example.com  ",
        viewer_recipient: "\talice@example.com\n",
      }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("missing viewer_recipient (undefined) → 403 recipient_mismatch", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        // viewer_recipient intentionally omitted
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("null recipient_id → 403 recipient_mismatch even when viewer_recipient is supplied", () => {
    // `!expected` short-circuits the mismatch, so a missing scoped recipient
    // must never satisfy an email/org/api_partner consent.
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "org",
        recipient_id: null,
        viewer_recipient: "anyone@example.com",
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("empty-string recipient_id → 403 recipient_mismatch (parity with null)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "api_partner",
        recipient_id: "",
        viewer_recipient: "partner-x",
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("empty-string viewer_recipient against a set recipient_id → 403 recipient_mismatch", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "",
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });

  it("whitespace-only viewer_recipient trims to empty → 403 recipient_mismatch", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "   \t\n   ",
      }),
    );
    expect(out).toEqual({
      ok: false,
      status: 403,
      reason: "recipient_mismatch",
    });
  });
});

describe("decideConsentAccess — clock injection & default now", () => {
  it("defaults now to new Date() when input.now is omitted (past expiry still 410)", () => {
    // Without passing `now`, an expiry from 2020 must still fire the 410
    // branch because the real wall clock is > 2020.
    const out = decideConsentAccess(
      base({ expires_at: "2020-01-01T00:00:00.000Z" }),
    );
    expect(out).toEqual({ ok: false, status: 410, reason: "consent_expired" });
  });

  it("defaults now to new Date() when input.now is omitted (far-future expiry passes)", () => {
    const out = decideConsentAccess(
      base({ expires_at: "2099-01-01T00:00:00.000Z" }),
    );
    expect(out).toEqual({ ok: true });
  });

  it("injected now controls expiry decision independently of wall clock", () => {
    // Wall clock says 2026; inject now=2019 so a 2020 expiry still passes.
    const out = decideConsentAccess(
      base({
        now: new Date("2019-06-01T00:00:00.000Z"),
        expires_at: "2020-01-01T00:00:00.000Z",
      }),
    );
    expect(out).toEqual({ ok: true });
  });
});

describe("decideConsentAccess — happy path & return shape", () => {
  it("all-clear returns exactly { ok: true } (no extra keys)", () => {
    const out = decideConsentAccess(
      base({
        now: NOW,
        expires_at: FUTURE.toISOString(),
        revoked_at: null,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "alice@example.com",
        viewer_recipient: "alice@example.com",
      }),
    );
    expect(out).toEqual({ ok: true });
    expect(Object.keys(out).sort()).toEqual(["ok"]);
  });

  it("failure shape has exactly ok/status/reason keys", () => {
    const out = decideConsentAccess(
      base({ now: NOW, expires_at: PAST.toISOString() }),
    );
    if (out.ok) throw new Error("expected failure branch");
    expect(Object.keys(out).sort()).toEqual(["ok", "reason", "status"]);
    expect(out.status).toBe(410);
    expect(out.reason).toBe("consent_expired");
  });

  it("status codes are constrained to the documented set (410 | 403)", () => {
    const cases: ConsentDecisionInput[] = [
      base({ now: NOW, expires_at: PAST.toISOString() }), // 410
      base({ now: NOW, revoked_at: PAST.toISOString() }), // 403
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "a@b",
        viewer_recipient: "x@y",
      }), // 403
    ];
    for (const input of cases) {
      const out = decideConsentAccess(input) as Extract<
        ConsentDecision,
        { ok: false }
      >;
      expect([410, 403]).toContain(out.status);
    }
  });

  it("reason codes are stable strings (regression-critical for /api/consent logs)", () => {
    const expired = decideConsentAccess(
      base({ now: NOW, expires_at: PAST.toISOString() }),
    );
    const revoked = decideConsentAccess(
      base({ now: NOW, revoked_at: PAST.toISOString() }),
    );
    const mismatch = decideConsentAccess(
      base({
        now: NOW,
        onward_share_prohibited: true,
        recipient_kind: "email",
        recipient_id: "a@b",
        viewer_recipient: "x@y",
      }),
    );
    expect((expired as { reason: string }).reason).toBe("consent_expired");
    expect((revoked as { reason: string }).reason).toBe("consent_revoked");
    expect((mismatch as { reason: string }).reason).toBe("recipient_mismatch");
  });
});
