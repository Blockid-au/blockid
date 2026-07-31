// Colocated vitest for the server-only IP hashing + client-IP extraction
// helpers. Every view-tracking row (founder pack views, showcase visits,
// investor-portal analytics) writes a `viewer_ip_hash` column that flows
// through `hashIp`. The privacy contract callers depend on:
//
//   • raw IP addresses NEVER hit disk — sha256 is one-way + salted
//   • salt rotates daily by default (`YYYYMMDD-default-salt`) so a viewer on
//     day N looks like a different person on day N+1 — pins the "per-day
//     uniqueness only" intent
//   • `IP_HASH_SALT` env override wins over the daily default when set so an
//     operator can pin cross-day uniqueness for a fraud-analysis window
//   • falsy inputs (null/undefined/empty-string) short-circuit to null so
//     callers do not persist a sentinel hash for an untrackable viewer
//   • `clientIpFromHeaders` prefers the first XFF entry (real client) over
//     `x-real-ip` per Caddy convention — a rewrite that read the last entry
//     would silently hash the Caddy loopback for every request
//
// Pure lib — only depends on node:crypto + `Date`. Fake timers isolate the
// daily-salt path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { clientIpFromHeaders, hashIp } from "./iphash";

const ORIGINAL_SALT = process.env.IP_HASH_SALT;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("hashIp — falsy short-circuits", () => {
  beforeEach(() => {
    delete process.env.IP_HASH_SALT;
  });
  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = ORIGINAL_SALT;
  });

  it("returns null for null input", () => {
    expect(hashIp(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(hashIp(undefined)).toBeNull();
  });

  it("returns null for empty-string input", () => {
    expect(hashIp("")).toBeNull();
  });

  it("hashes the literal string '0' — truthy JS string, not a falsy zero", () => {
    process.env.IP_HASH_SALT = "pin-salt";
    const out = hashIp("0");
    expect(out).toBe(sha256Hex("0|pin-salt"));
  });
});

describe("hashIp — env salt path", () => {
  beforeEach(() => {
    process.env.IP_HASH_SALT = "pinned-test-salt";
  });
  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = ORIGINAL_SALT;
  });

  it("returns a 64-char lowercase hex sha256 digest", () => {
    const out = hashIp("1.2.3.4");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out).toBe(out?.toLowerCase());
  });

  it("matches an externally-computed sha256 over `${ip}|${salt}`", () => {
    const out = hashIp("1.2.3.4");
    expect(out).toBe(sha256Hex("1.2.3.4|pinned-test-salt"));
  });

  it("is deterministic across repeat calls with the same salt", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
  });

  it("produces distinct digests for distinct IPs (avalanche)", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("distinguishes IPv4 from a lookalike IPv6", () => {
    expect(hashIp("192.0.2.1")).not.toBe(hashIp("::ffff:192.0.2.1"));
  });

  it("changes when the salt env var changes", () => {
    const a = hashIp("198.51.100.7");
    process.env.IP_HASH_SALT = "different-salt";
    const b = hashIp("198.51.100.7");
    expect(a).not.toBe(b);
  });

  it("env salt wins over the daily-default fallback (no date substring in digest input)", () => {
    // Baseline against pinned salt.
    const withEnv = hashIp("10.0.0.1");
    expect(withEnv).toBe(sha256Hex("10.0.0.1|pinned-test-salt"));
    // And the digest is stable regardless of the wall clock (mock jumps a year).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2030, 5, 1, 0, 0, 0)));
    try {
      expect(hashIp("10.0.0.1")).toBe(withEnv);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves case-sensitive input — an IPv6 with mixed case is not normalised", () => {
    // Contract pin: hashIp does not normalise its input. Callers wanting a
    // canonical IPv6 form must normalise upstream.
    expect(hashIp("2001:DB8::1")).not.toBe(hashIp("2001:db8::1"));
  });
});

describe("hashIp — daily-default salt path (no env)", () => {
  beforeEach(() => {
    delete process.env.IP_HASH_SALT;
  });
  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_SALT === undefined) delete process.env.IP_HASH_SALT;
    else process.env.IP_HASH_SALT = ORIGINAL_SALT;
  });

  it("falls back to `${YYYYMMDD}-default-salt` using UTC date components", () => {
    vi.useFakeTimers();
    // Pick a fixed UTC instant with 2-digit month + day boundaries covered.
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 12, 34, 56))); // 2026-07-31 UTC
    const expectedSalt = "20260731-default-salt";
    expect(hashIp("192.0.2.10")).toBe(sha256Hex(`192.0.2.10|${expectedSalt}`));
  });

  it("pads single-digit months and days to two characters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, 0, 0))); // 2026-01-01 UTC
    expect(hashIp("192.0.2.11")).toBe(
      sha256Hex(`192.0.2.11|20260101-default-salt`),
    );
  });

  it("rotates the salt at UTC midnight — same IP maps to different digests across day boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 23, 59, 59)));
    const jul31 = hashIp("192.0.2.20");
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 1, 0, 0, 0)));
    const aug1 = hashIp("192.0.2.20");
    expect(jul31).not.toBe(aug1);
    expect(jul31).toBe(sha256Hex("192.0.2.20|20260731-default-salt"));
    expect(aug1).toBe(sha256Hex("192.0.2.20|20260801-default-salt"));
  });

  it("stays stable within the same UTC day across two calls", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 3, 15, 0)));
    const a = hashIp("192.0.2.30");
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 21, 45, 0)));
    const b = hashIp("192.0.2.30");
    expect(a).toBe(b);
  });

  it("uses the UTC date even when the process time-zone offset would flip the day", () => {
    // The salt is derived from getUTC*, so a Sydney-local 10:00 on 2026-07-31
    // (00:00 UTC) hashes to the 20260731 salt, not 20260730.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 31, 0, 0, 0)));
    expect(hashIp("192.0.2.40")).toBe(
      sha256Hex("192.0.2.40|20260731-default-salt"),
    );
  });
});

describe("clientIpFromHeaders", () => {
  it("returns the first XFF entry when present", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.2" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.1");
  });

  it("trims whitespace around the first XFF entry", () => {
    const h = new Headers({ "x-forwarded-for": "   203.0.113.7   , 10.0.0.2" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
  });

  it("returns the sole XFF entry when there is no comma", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.9" });
    expect(clientIpFromHeaders(h)).toBe("198.51.100.9");
  });

  it("prefers XFF over x-real-ip when both are set", () => {
    const h = new Headers({
      "x-forwarded-for": "203.0.113.10",
      "x-real-ip": "10.0.0.1",
    });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip when XFF is absent", () => {
    const h = new Headers({ "x-real-ip": "10.0.0.55" });
    expect(clientIpFromHeaders(h)).toBe("10.0.0.55");
  });

  it("returns null when neither header is set", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });

  it("falls back to x-real-ip when XFF is present but the first entry is empty after trim", () => {
    // XFF like "   , 10.0.0.2" — the first slot is whitespace-only. The
    // helper short-circuits on the first slot yielding a non-empty string.
    const h = new Headers({
      "x-forwarded-for": "   , 10.0.0.2",
      "x-real-ip": "10.0.0.99",
    });
    expect(clientIpFromHeaders(h)).toBe("10.0.0.99");
  });

  it("falls back to x-real-ip when XFF is a single empty string", () => {
    const h = new Headers({
      "x-forwarded-for": "",
      "x-real-ip": "10.0.0.42",
    });
    expect(clientIpFromHeaders(h)).toBe("10.0.0.42");
  });

  it("returns null when both XFF is empty and x-real-ip is unset", () => {
    const h = new Headers({ "x-forwarded-for": "" });
    expect(clientIpFromHeaders(h)).toBeNull();
  });

  it("preserves IPv6 with brackets stripped by Headers normalisation", () => {
    // A single IPv6 XFF entry — should round-trip verbatim (no bracket
    // stripping) because callers pass through to `hashIp` which treats the
    // string opaquely.
    const h = new Headers({ "x-forwarded-for": "2001:db8::1" });
    expect(clientIpFromHeaders(h)).toBe("2001:db8::1");
  });

  it("preserves any non-IP token in the XFF slot without validation", () => {
    // Pin: this helper does not validate the IP shape. A downstream sanity
    // check must happen at the caller. Documenting this prevents a caller
    // from assuming they can persist the output without validation.
    const h = new Headers({ "x-forwarded-for": "not-an-ip" });
    expect(clientIpFromHeaders(h)).toBe("not-an-ip");
  });
});
