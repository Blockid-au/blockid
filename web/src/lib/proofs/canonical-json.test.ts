// Colocated vitest for the deterministic JSON canonicalizer that keys the
// tamper-evident score-proof chain (`POST /api/proofs/score` → canonicalize →
// hashScore → insert into `score_proofs`). The pinned contract callers depend on:
//
//   • object keys sorted lexicographically at every nesting depth so a caller
//     re-serialising the same logical score in a different key order still hits
//     the exact same SHA-256 digest;
//   • array insertion order preserved (elements are NOT sorted) so an ordered
//     list like a top-3 competitor ranking stays semantically stable;
//   • undefined values dropped (JSON.stringify default preserved even inside
//     the sorted-key path so a caller does not need to pre-filter);
//   • null values retained (distinct from undefined per the JsonPrimitive type);
//   • no trailing newline, no extra whitespace (byte-for-byte stability);
//   • empty objects / empty arrays round-trip to `{}` / `[]` without a spurious
//     comma or space.
//
// A regression here silently desynchronises the disclaimer_hash chain and the
// score-proof anchor — so the tests below sweep every branch of the replacer
// and pin the observable byte output rather than just the parse-round-trip.

import { describe, expect, it } from "vitest";
import { canonicalizeScore } from "./canonical-json";

describe("canonicalizeScore", () => {
  it("sorts top-level object keys lexicographically", () => {
    const out = canonicalizeScore({ b: 1, a: 2, c: 3 });
    expect(out).toBe(`{"a":2,"b":1,"c":3}`);
  });

  it("is order-invariant across two callers of the same logical object", () => {
    const a = canonicalizeScore({ zeta: 1, alpha: 2, mu: 3 });
    const b = canonicalizeScore({ mu: 3, alpha: 2, zeta: 1 });
    expect(a).toBe(b);
  });

  it("sorts nested object keys recursively", () => {
    const out = canonicalizeScore({
      outer: { z: 1, a: 2, m: { y: 1, x: 2 } },
    });
    expect(out).toBe(`{"outer":{"a":2,"m":{"x":2,"y":1},"z":1}}`);
  });

  it("preserves array insertion order (does NOT sort array elements)", () => {
    const out = canonicalizeScore({ ranks: ["c", "a", "b"] });
    expect(out).toBe(`{"ranks":["c","a","b"]}`);
  });

  it("sorts keys inside objects nested within arrays", () => {
    const out = canonicalizeScore({
      competitors: [
        { name: "A", score: 1 },
        { score: 2, name: "B" },
      ],
    });
    expect(out).toBe(
      `{"competitors":[{"name":"A","score":1},{"name":"B","score":2}]}`,
    );
  });

  it("drops undefined values at the top level", () => {
    const out = canonicalizeScore({ a: 1, b: undefined, c: 3 } as Record<
      string,
      unknown
    >);
    expect(out).toBe(`{"a":1,"c":3}`);
  });

  it("drops undefined values inside nested objects", () => {
    const out = canonicalizeScore({
      outer: { keep: "yes", skip: undefined, also: "yes" },
    } as Record<string, unknown>);
    expect(out).toBe(`{"outer":{"also":"yes","keep":"yes"}}`);
  });

  it("retains null values (null !== undefined)", () => {
    const out = canonicalizeScore({ a: null, b: 1 });
    expect(out).toBe(`{"a":null,"b":1}`);
  });

  it("serialises empty objects as {}", () => {
    expect(canonicalizeScore({})).toBe(`{}`);
  });

  it("serialises objects containing an empty object without extra whitespace", () => {
    expect(canonicalizeScore({ nested: {} })).toBe(`{"nested":{}}`);
  });

  it("serialises objects containing an empty array without extra whitespace", () => {
    expect(canonicalizeScore({ items: [] })).toBe(`{"items":[]}`);
  });

  it("preserves numeric types (integer, float, negative)", () => {
    const out = canonicalizeScore({ a: 1, b: 2.5, c: -3.75 });
    expect(out).toBe(`{"a":1,"b":2.5,"c":-3.75}`);
  });

  it("preserves boolean and string primitives", () => {
    const out = canonicalizeScore({ flag: true, other: false, name: "x" });
    // sorted: flag, name, other
    expect(out).toBe(`{"flag":true,"name":"x","other":false}`);
  });

  it("escapes special characters inside strings via JSON.stringify semantics", () => {
    const out = canonicalizeScore({ s: 'a"b\nc\\d' });
    expect(out).toBe(`{"s":"a\\"b\\nc\\\\d"}`);
  });

  it("emits no trailing newline and no leading whitespace", () => {
    const out = canonicalizeScore({ a: 1 });
    expect(out.startsWith(" ")).toBe(false);
    expect(out.endsWith("\n")).toBe(false);
    expect(out).toBe(`{"a":1}`);
  });

  it("is deterministic across shuffled deep structures", () => {
    const forwards = canonicalizeScore({
      z: { b: [1, { q: 1, p: 2 }, 3], a: 1 },
      a: 2,
    });
    const backwards = canonicalizeScore({
      a: 2,
      z: { a: 1, b: [1, { p: 2, q: 1 }, 3] },
    });
    expect(forwards).toBe(backwards);
  });

  it("sorts keys with digits and underscores lexicographically (ASCII order)", () => {
    // ASCII: digits (0x30-0x39) < underscore (0x5F) < lowercase a-z (0x61-0x7A)
    const out = canonicalizeScore({ _b: 1, a: 2, "1c": 3 });
    expect(out).toBe(`{"1c":3,"_b":1,"a":2}`);
  });

  it("does not swallow a key whose value is `null` (contrast with undefined)", () => {
    const out = canonicalizeScore({ a: null, b: undefined } as Record<
      string,
      unknown
    >);
    expect(out).toBe(`{"a":null}`);
  });

  it("returns a distinct byte string when a single value changes", () => {
    const before = canonicalizeScore({ score: 42, notes: "ok" });
    const after = canonicalizeScore({ score: 43, notes: "ok" });
    expect(before).not.toBe(after);
  });

  it("preserves an array containing undefined by rendering it as null (JSON.stringify default)", () => {
    // JSON.stringify replaces undefined array slots with null — this test pins
    // that the canonicalizer does NOT filter them out (an array slot is
    // semantically meaningful, unlike an undefined object property).
    const out = canonicalizeScore({
      arr: [1, undefined as unknown as number, 3],
    });
    expect(out).toBe(`{"arr":[1,null,3]}`);
  });

  it("handles a fixture that mirrors a real score payload", () => {
    // Two callers hand-build the same logical score in different key order —
    // both must produce a byte-for-byte identical canonical string so the
    // downstream sha256 anchor matches on the second insert.
    const forwards = canonicalizeScore({
      startup_id: "sid-1",
      dimensions: {
        market: 78,
        team: 65,
        traction: 42,
      },
      calibrated: true,
      composite: 61.7,
    });
    const backwards = canonicalizeScore({
      composite: 61.7,
      dimensions: {
        traction: 42,
        team: 65,
        market: 78,
      },
      calibrated: true,
      startup_id: "sid-1",
    });
    expect(forwards).toBe(backwards);
    expect(forwards).toBe(
      `{"calibrated":true,"composite":61.7,"dimensions":{"market":78,"team":65,"traction":42},"startup_id":"sid-1"}`,
    );
  });
});
