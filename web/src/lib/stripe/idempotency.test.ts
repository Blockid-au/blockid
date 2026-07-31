import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { sessionIdempotencyKey } from "./idempotency";

// The public surface of `./idempotency` is a single pure function that mints a
// Stripe idempotency key from `(scope, parts[])`. The key shape is:
//
//   bid:<scope>:<hourBucket>:<sha256-12>
//
// where `hourBucket = floor(Date.now() / 3_600_000)` and the digest is the
// first 12 hex chars of sha256 over `parts.map(String).join("|")` (with
// null/undefined coerced to "").
//
// These tests pin the wire format, the determinism contract (same inputs →
// same key), the sensitivity contract (any change in scope/parts/hour flips
// the key), and the null/undefined coercion so a caller cannot accidentally
// widen the collision surface.

const KEY_RE = /^bid:([a-zA-Z0-9._-]+):(\d+):([0-9a-f]{12})$/;

function parse(key: string) {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`unparseable idempotency key: ${key}`);
  return { scope: m[1], bucket: Number(m[2]), digest: m[3] };
}

function expectedDigest(parts: Array<string | number | null | undefined>) {
  const material = parts.map((p) => (p == null ? "" : String(p))).join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

// Fixed reference instant: 2026-07-31T10:00:00.000Z. Any test that pins the
// bucket resets Date.now via vi.spyOn — restored in afterEach.
const REF_MS = Date.parse("2026-07-31T10:00:00.000Z");
const REF_BUCKET = Math.floor(REF_MS / 3_600_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionIdempotencyKey — wire format", () => {
  it("matches the bid:<scope>:<bucket>:<sha256-12> shape", () => {
    const key = sessionIdempotencyKey("checkout", ["u_1", "plan_growth"]);
    expect(key).toMatch(KEY_RE);
  });

  it("prefixes with the literal 'bid:' namespace", () => {
    const key = sessionIdempotencyKey("checkout", ["u_1"]);
    expect(key.startsWith("bid:")).toBe(true);
  });

  it("uses exactly 12 lowercase hex chars for the digest tail", () => {
    const key = sessionIdempotencyKey("credits", ["u_1", 50]);
    const { digest } = parse(key);
    expect(digest).toHaveLength(12);
    expect(digest).toMatch(/^[0-9a-f]{12}$/);
  });

  it("preserves the scope verbatim in the second segment", () => {
    const key = sessionIdempotencyKey("analysis", ["u_1"]);
    expect(parse(key).scope).toBe("analysis");
  });

  it("emits an integer hour bucket in the third segment", () => {
    const key = sessionIdempotencyKey("checkout", ["u_1"]);
    const { bucket } = parse(key);
    expect(Number.isInteger(bucket)).toBe(true);
    expect(bucket).toBeGreaterThan(0);
  });
});

describe("sessionIdempotencyKey — determinism", () => {
  it("returns the same key for the same (scope, parts) within the same hour", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1", "plan_growth", 25]);
    const b = sessionIdempotencyKey("checkout", ["u_1", "plan_growth", 25]);
    expect(a).toBe(b);
  });

  it("pins the exact digest for a known input (regression guard)", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const parts = ["u_1", "plan_growth", 25];
    const key = sessionIdempotencyKey("checkout", parts);
    expect(key).toBe(`bid:checkout:${REF_BUCKET}:${expectedDigest(parts)}`);
  });

  it("returns keys with the pinned bucket when Date.now is fixed", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const key = sessionIdempotencyKey("checkout", ["u_1"]);
    expect(parse(key).bucket).toBe(REF_BUCKET);
  });
});

describe("sessionIdempotencyKey — sensitivity", () => {
  it("changes when the scope changes (parts identical)", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1"]);
    const b = sessionIdempotencyKey("credits", ["u_1"]);
    expect(a).not.toBe(b);
  });

  it("changes when any part value changes", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1", "plan_growth"]);
    const b = sessionIdempotencyKey("checkout", ["u_2", "plan_growth"]);
    expect(a).not.toBe(b);
  });

  it("changes when parts are reordered (order-sensitive)", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1", "plan_growth"]);
    const b = sessionIdempotencyKey("checkout", ["plan_growth", "u_1"]);
    expect(a).not.toBe(b);
  });

  it("rolls the bucket (and therefore the key) at each hour boundary", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const early = sessionIdempotencyKey("checkout", ["u_1"]);
    vi.spyOn(Date, "now").mockReturnValue(REF_MS + 3_600_000);
    const later = sessionIdempotencyKey("checkout", ["u_1"]);
    expect(early).not.toBe(later);
    expect(parse(later).bucket - parse(early).bucket).toBe(1);
  });

  it("keeps the same bucket for two calls within the same hour window", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS + 60_000); // +1 min
    const a = sessionIdempotencyKey("checkout", ["u_1"]);
    vi.spyOn(Date, "now").mockReturnValue(REF_MS + 3_540_000); // +59 min
    const b = sessionIdempotencyKey("checkout", ["u_1"]);
    expect(parse(a).bucket).toBe(parse(b).bucket);
    expect(a).toBe(b);
  });

  it("digest reflects a change even in the last part", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1", "plan_growth", 25]);
    const b = sessionIdempotencyKey("checkout", ["u_1", "plan_growth", 26]);
    expect(parse(a).digest).not.toBe(parse(b).digest);
  });
});

describe("sessionIdempotencyKey — null / undefined coercion", () => {
  it("coerces null and undefined to the empty string", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const withNull = sessionIdempotencyKey("checkout", ["u_1", null, "x"]);
    const withUndef = sessionIdempotencyKey("checkout", ["u_1", undefined, "x"]);
    const withEmpty = sessionIdempotencyKey("checkout", ["u_1", "", "x"]);
    expect(withNull).toBe(withUndef);
    expect(withNull).toBe(withEmpty);
  });

  it("still keeps the '|' separator so null between values ≠ missing value", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    // ["u_1", null, "x"] joins as "u_1||x"; ["u_1", "x"] joins as "u_1|x".
    // The digest for those two must differ or the caller's collision surface
    // silently widens.
    const withGap = sessionIdempotencyKey("checkout", ["u_1", null, "x"]);
    const withoutGap = sessionIdempotencyKey("checkout", ["u_1", "x"]);
    expect(withGap).not.toBe(withoutGap);
  });

  it("stringifies numbers via String() (0 → '0', not falsy → '')", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const withZero = sessionIdempotencyKey("credits", ["u_1", 0]);
    const withNull = sessionIdempotencyKey("credits", ["u_1", null]);
    // '0' vs '' must not collide — otherwise a $0 pack and an omitted pack
    // would share an idempotency key.
    expect(withZero).not.toBe(withNull);
  });

  it("accepts an empty parts array without throwing", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const key = sessionIdempotencyKey("checkout", []);
    expect(key).toMatch(KEY_RE);
    expect(parse(key).digest).toBe(expectedDigest([]));
  });
});

describe("sessionIdempotencyKey — mixed types", () => {
  it("string 'u_1' and number 1 do not collide (both stringified)", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["u_1"]);
    const b = sessionIdempotencyKey("checkout", [1]);
    expect(a).not.toBe(b);
  });

  it("string '1' and number 1 collide (String(1) === '1')", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const a = sessionIdempotencyKey("checkout", ["1"]);
    const b = sessionIdempotencyKey("checkout", [1]);
    // This is the *documented* consequence of the String() coercion —
    // callers must not pass ambiguous mixed types for the same slot.
    expect(a).toBe(b);
  });

  it("handles long parts and still emits exactly 12 digest chars", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const key = sessionIdempotencyKey("checkout", [
      "u_" + "x".repeat(2048),
      "plan_" + "y".repeat(1024),
    ]);
    expect(parse(key).digest).toHaveLength(12);
  });

  it("accepts a scope containing dots/dashes/underscores without mangling", () => {
    vi.spyOn(Date, "now").mockReturnValue(REF_MS);
    const key = sessionIdempotencyKey("credits.pack_v2-beta", ["u_1"]);
    expect(parse(key).scope).toBe("credits.pack_v2-beta");
  });
});
