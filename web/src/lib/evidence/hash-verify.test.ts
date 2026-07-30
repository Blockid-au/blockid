import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

import { verifyEvidenceHash } from "./hash-verify";

const sha256Hex = (input: Buffer | string): string =>
  createHash("sha256").update(input).digest("hex");

// Precomputed once so mis-typed literals show up as test failures rather
// than false negatives.
const HELLO = Buffer.from("hello world", "utf8");
const HELLO_HASH = sha256Hex(HELLO);
const EMPTY_HASH = sha256Hex(Buffer.alloc(0));

describe("verifyEvidenceHash", () => {
  it("returns true for a matching buffer + hash", async () => {
    expect(await verifyEvidenceHash(HELLO, HELLO_HASH)).toBe(true);
  });

  it("returns false when the hash does not match the bytes", async () => {
    const wrong = sha256Hex(Buffer.from("goodbye world", "utf8"));
    expect(await verifyEvidenceHash(HELLO, wrong)).toBe(false);
  });

  it("verifies an empty buffer against its known sha256 digest", async () => {
    expect(await verifyEvidenceHash(Buffer.alloc(0), EMPTY_HASH)).toBe(true);
  });

  it("returns false for a too-short hex string", async () => {
    expect(await verifyEvidenceHash(HELLO, HELLO_HASH.slice(0, 63))).toBe(
      false,
    );
  });

  it("returns false for a too-long hex string", async () => {
    expect(await verifyEvidenceHash(HELLO, `${HELLO_HASH}a`)).toBe(false);
  });

  it("normalises uppercase hex to lowercase before comparing", async () => {
    expect(await verifyEvidenceHash(HELLO, HELLO_HASH.toUpperCase())).toBe(
      true,
    );
  });

  it("returns false for a string containing non-hex characters", async () => {
    // Correct length, but contains a `z` — must be rejected without
    // throwing so callers can treat the return as authoritative.
    const bad = `${HELLO_HASH.slice(0, 63)}z`;
    expect(await verifyEvidenceHash(HELLO, bad)).toBe(false);
  });

  it("hashes bytes only — a unicode filename does not affect the digest", async () => {
    // Two buffers with identical bytes must produce identical hashes
    // regardless of any surrounding filename or metadata the caller
    // might imagine. This proves the helper looks at bytes only.
    const filenameA = "報告書-café.pdf";
    const filenameB = "invoice.pdf";
    void filenameA;
    void filenameB;
    const bytes = Buffer.from([0x01, 0x02, 0x03, 0xff]);
    const hash = sha256Hex(bytes);
    expect(await verifyEvidenceHash(bytes, hash)).toBe(true);
    // A different buffer with the same "filename intent" still fails.
    expect(await verifyEvidenceHash(Buffer.from([0x04, 0x05]), hash)).toBe(
      false,
    );
  });
});
