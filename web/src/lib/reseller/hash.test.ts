import { afterEach, describe, expect, it } from "vitest";
import { hashUserId } from "./hash";

// Covers CISO D3-CISO-07 posture:
//   1. deterministic — same input → same hash (so Stripe-side lookups can
//      be recomputed by the app without any reversal step);
//   2. non-reversible — output must NOT equal the plaintext, must be a
//      fixed-width hex string, and must be salt-sensitive (rotating the
//      env salt yields a totally different digest).

const SAMPLE_UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("hashUserId", () => {
  const originalSalt = process.env.RESELLER_METADATA_SALT;

  afterEach(() => {
    if (originalSalt === undefined) delete process.env.RESELLER_METADATA_SALT;
    else process.env.RESELLER_METADATA_SALT = originalSalt;
  });

  it("is deterministic across repeated calls with the same input", () => {
    process.env.RESELLER_METADATA_SALT = "test-salt-alpha";
    const a = hashUserId(SAMPLE_UUID);
    const b = hashUserId(SAMPLE_UUID);
    expect(a).toBe(b);
  });

  it("returns a fixed-width hex string (128-bit truncation → 32 hex chars)", () => {
    process.env.RESELLER_METADATA_SALT = "test-salt-alpha";
    const digest = hashUserId(SAMPLE_UUID);
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces distinct outputs for distinct inputs", () => {
    process.env.RESELLER_METADATA_SALT = "test-salt-alpha";
    const a = hashUserId("00000000-0000-0000-0000-000000000001");
    const b = hashUserId("00000000-0000-0000-0000-000000000002");
    expect(a).not.toBe(b);
  });

  it("does NOT return the plaintext (non-reversibility posture)", () => {
    process.env.RESELLER_METADATA_SALT = "test-salt-alpha";
    const digest = hashUserId(SAMPLE_UUID);
    expect(digest).not.toBe(SAMPLE_UUID);
    expect(digest).not.toContain(SAMPLE_UUID);
    // A raw v4 UUID contains hyphens; the truncated digest never does.
    expect(digest).not.toContain("-");
  });

  it("is salt-sensitive — rotating the salt changes the digest", () => {
    process.env.RESELLER_METADATA_SALT = "test-salt-alpha";
    const a = hashUserId(SAMPLE_UUID);
    process.env.RESELLER_METADATA_SALT = "test-salt-beta";
    const b = hashUserId(SAMPLE_UUID);
    expect(a).not.toBe(b);
  });

  it("throws for empty or non-string inputs", () => {
    expect(() => hashUserId("")).toThrow(/userId is required/);
    // @ts-expect-error — intentionally passing a bad type at runtime
    expect(() => hashUserId(undefined)).toThrow(/userId is required/);
  });
});
