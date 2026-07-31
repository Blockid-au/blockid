/**
 * Colocated pure test for the OAuth2 partner bearer verifier.
 *
 * Master Upgrade Plan §5.5 — pins the accept/deny predicate so a wrong-
 * scope or expired token can never leak into the partner API.
 *
 * These tests exercise only the pure predicate + hash helpers — no DB,
 * no Supabase mock. The async `verifyPartnerBearer` wrapper is a thin
 * fetch-and-delegate around the same predicate.
 */

import { describe, it, expect } from "vitest";
import {
  decidePartnerAccess,
  parseBearerHeader,
  hashBearer,
  constantTimeHexEqual,
  type OAuth2TokenRecord,
} from "./verify-bearer";

function record(overrides: Partial<OAuth2TokenRecord> = {}): OAuth2TokenRecord {
  return {
    client_id: "cli_abc",
    token_hash: "a".repeat(64),
    token_kind: "access",
    scopes: ["id:public:read", "evidence:read"],
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
    subject_user_id: "usr_1",
    subject_business_id: "biz_1",
    ...overrides,
  };
}

const NOW = "2026-07-31T00:00:00.000Z";

describe("decidePartnerAccess", () => {
  it("accepts a valid token with a matching scope", () => {
    const decision = decidePartnerAccess(record(), "id:public:read", NOW);
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.clientId).toBe("cli_abc");
      expect(decision.scopes).toEqual(["id:public:read", "evidence:read"]);
      expect(decision.subject).toEqual({ userId: "usr_1", businessId: "biz_1" });
    }
  });

  it("rejects when the required scope is not in the granted set", () => {
    const decision = decidePartnerAccess(
      record({ scopes: ["evidence:read"] }),
      "verification:write",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "scope-miss" });
  });

  it("rejects when expires_at is in the past", () => {
    const decision = decidePartnerAccess(
      record({ expires_at: "2020-01-01T00:00:00.000Z" }),
      "id:public:read",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when expires_at equals now (strict >)", () => {
    const decision = decidePartnerAccess(
      record({ expires_at: NOW }),
      "id:public:read",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when revoked_at is set", () => {
    const decision = decidePartnerAccess(
      record({ revoked_at: "2026-06-01T00:00:00.000Z" }),
      "id:public:read",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects a refresh token at the API edge", () => {
    const decision = decidePartnerAccess(
      record({ token_kind: "refresh" }),
      "id:public:read",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "wrong-kind" });
  });

  it("rejects when the record is null (not-found)", () => {
    const decision = decidePartnerAccess(null, "id:public:read", NOW);
    expect(decision).toEqual({ ok: false, reason: "not-found" });
  });

  it("rejects when scopes array is empty", () => {
    const decision = decidePartnerAccess(
      record({ scopes: [] }),
      "id:public:read",
      NOW,
    );
    expect(decision).toEqual({ ok: false, reason: "scope-miss" });
  });
});

describe("parseBearerHeader", () => {
  it("parses a well-formed Bearer header", () => {
    expect(parseBearerHeader("Bearer abc123._-+/=")).toBe("abc123._-+/=");
  });

  it("is case-insensitive on the scheme", () => {
    expect(parseBearerHeader("bearer abc")).toBe("abc");
    expect(parseBearerHeader("BEARER abc")).toBe("abc");
  });

  it("returns null for missing / non-string / empty", () => {
    expect(parseBearerHeader(null)).toBeNull();
    expect(parseBearerHeader(undefined)).toBeNull();
    expect(parseBearerHeader("")).toBeNull();
    expect(parseBearerHeader("   ")).toBeNull();
  });

  it("rejects a bare token (no Bearer scheme)", () => {
    expect(parseBearerHeader("abc123")).toBeNull();
  });

  it("rejects a Basic auth header", () => {
    expect(parseBearerHeader("Basic dXNlcjpwYXNz")).toBeNull();
  });

  it("rejects tokens with whitespace in them", () => {
    expect(parseBearerHeader("Bearer abc def")).toBeNull();
  });
});

describe("hashBearer", () => {
  it("produces a 64-char lowercase hex SHA-256 digest", () => {
    const h = hashBearer("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input, same digest", () => {
    expect(hashBearer("abc")).toBe(hashBearer("abc"));
  });

  it("differs across different inputs (basic distinctness)", () => {
    expect(hashBearer("abc")).not.toBe(hashBearer("abd"));
  });
});

describe("constantTimeHexEqual", () => {
  it("returns true for identical hex strings", () => {
    const h = hashBearer("payload");
    expect(constantTimeHexEqual(h, h)).toBe(true);
  });

  it("returns false for differing hex strings of equal length", () => {
    expect(constantTimeHexEqual("a".repeat(64), "b".repeat(64))).toBe(false);
  });

  it("returns false for unequal-length inputs", () => {
    expect(constantTimeHexEqual("a".repeat(64), "a".repeat(62))).toBe(false);
  });

  it("does not crash on non-hex characters (parses to empty buffer)", () => {
    // "zzz..." isn't hex; Buffer.from(_,'hex') truncates to empty. Both
    // become equal empty buffers under timingSafeEqual — documented so a
    // regression that starts throwing on bad input is caught.
    expect(() => constantTimeHexEqual("z".repeat(64), "z".repeat(64))).not.toThrow();
  });

  it("returns false for non-string arguments", () => {
    // @ts-expect-error — deliberate misuse to prove the runtime guard.
    expect(constantTimeHexEqual(null, "a".repeat(64))).toBe(false);
    // @ts-expect-error — deliberate misuse to prove the runtime guard.
    expect(constantTimeHexEqual("a".repeat(64), 123)).toBe(false);
  });
});
