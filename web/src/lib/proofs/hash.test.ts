// Colocated vitest for the SHA-256 anchor helpers on the tamper-evident
// score-proof chain (`POST /api/proofs/score` → canonicalize → hashScore →
// insert into `score_proofs`). Pins the wire contract callers depend on:
//
//   • prefix format `blockid:v1:<hex>` — a rename here corrupts every
//     downstream trust-explorer parse and every UI badge lookup;
//   • hex digest is exactly 64 lowercase hex chars (SHA-256);
//   • determinism across calls with the same input string;
//   • utf-8 encoding on the update — a silent switch to utf-16 would flip the
//     digest for every non-ASCII disclaimer body;
//   • sensitivity to trailing whitespace / newline / case (avalanche);
//   • rawHex correctly strips the prefix on a valid BlockID hash and returns
//     null on anything that does not start with the prefix.

import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { hashScore, rawHex } from "./hash";

const PREFIX = "blockid:v1:";
const HEX_64 = /^[0-9a-f]{64}$/;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

describe("hashScore", () => {
  it("emits the canonical `blockid:v1:` prefix", () => {
    const out = hashScore(`{"a":1}`);
    expect(out.startsWith(PREFIX)).toBe(true);
  });

  it("emits a 64-char lowercase hex digest after the prefix", () => {
    const out = hashScore(`{"a":1}`);
    const hex = out.slice(PREFIX.length);
    expect(hex).toMatch(HEX_64);
  });

  it("total length is prefix + 64 hex chars", () => {
    const out = hashScore(`{"a":1}`);
    expect(out.length).toBe(PREFIX.length + 64);
  });

  it("is deterministic — same input yields same digest across calls", () => {
    const a = hashScore(`{"score":42}`);
    const b = hashScore(`{"score":42}`);
    expect(a).toBe(b);
  });

  it("matches a directly-computed SHA-256 over utf8 bytes", () => {
    const input = `{"a":1,"b":2}`;
    expect(hashScore(input)).toBe(`${PREFIX}${sha256Hex(input)}`);
  });

  it("hashes utf-8 bytes not utf-16 code units (non-ASCII input)", () => {
    // A silent switch to utf-16 encoding would flip the digest for every
    // AFSL disclaimer body containing curly quotes / bullets / em-dashes.
    const input = "café · résumé";
    expect(hashScore(input)).toBe(`${PREFIX}${sha256Hex(input)}`);
  });

  it("empty string maps to the canonical empty-sha256 anchor", () => {
    expect(hashScore("")).toBe(
      `${PREFIX}e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
    );
  });

  it("hex digest for `hello world` matches the RFC anchor", () => {
    expect(hashScore("hello world")).toBe(
      `${PREFIX}b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9`,
    );
  });

  it("distinguishes inputs that differ in a single byte (avalanche)", () => {
    const a = hashScore("hello world");
    const b = hashScore("hello worlD");
    expect(a).not.toBe(b);
  });

  it("distinguishes inputs that differ only by trailing newline", () => {
    const a = hashScore("hello world");
    const b = hashScore("hello world\n");
    expect(a).not.toBe(b);
  });

  it("distinguishes inputs that differ only by leading whitespace", () => {
    const a = hashScore(`{"a":1}`);
    const b = hashScore(` {"a":1}`);
    expect(a).not.toBe(b);
  });

  it("hex output contains no uppercase characters", () => {
    const hex = hashScore("Hello World").slice(PREFIX.length);
    expect(hex).toBe(hex.toLowerCase());
  });
});

describe("rawHex", () => {
  const knownHex =
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

  it("strips the `blockid:v1:` prefix from a valid hash", () => {
    expect(rawHex(`${PREFIX}${knownHex}`)).toBe(knownHex);
  });

  it("returns null on a string without the prefix", () => {
    expect(rawHex(knownHex)).toBeNull();
  });

  it("returns null on an empty string", () => {
    expect(rawHex("")).toBeNull();
  });

  it("returns null on a differently-prefixed hash (e.g. `blockid:v2:`)", () => {
    // A future version bump must be handled by a new parser, not silently
    // truncated by v1 — this pins the strict-prefix contract.
    expect(rawHex(`blockid:v2:${knownHex}`)).toBeNull();
  });

  it("returns null on a case-mismatched prefix (`BLOCKID:V1:`)", () => {
    // The prefix is a fixed literal; a case-insensitive parse would let a
    // caller ambiguously produce two hashes for the same digest.
    expect(rawHex(`BLOCKID:V1:${knownHex}`)).toBeNull();
  });

  it("round-trips through hashScore", () => {
    const full = hashScore("some canonical json");
    const hex = rawHex(full);
    expect(hex).not.toBeNull();
    expect(hex).toMatch(HEX_64);
    expect(full).toBe(`${PREFIX}${hex}`);
  });

  it("preserves the exact byte content after the prefix without further validation", () => {
    // rawHex is a pure prefix-strip — it does NOT validate that the tail is
    // 64 hex chars. Callers that need shape validation must layer that on top.
    // This pins the shipped contract so a future author considering adding a
    // regex guard here notices they would break callers that grep the trailing
    // slice with their own patterns.
    expect(rawHex(`${PREFIX}not-hex-at-all`)).toBe("not-hex-at-all");
    expect(rawHex(`${PREFIX}`)).toBe("");
  });
});
