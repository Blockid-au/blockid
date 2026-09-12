// S20-B — signing + verification (Stripe-style t=,v1=) and secret sealing.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSignatureHeader,
  computeSignature,
  DEFAULT_TOLERANCE_SEC,
  generateSecret,
  hashSecret,
  openSecret,
  parseSignatureHeader,
  sealSecret,
  secretHint,
  verifySignature,
} from "./sign";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", event: "svi.rescored", data: { svi_total: 120 } });

describe("generateSecret / hashSecret", () => {
  it("generates a whsec_ prefixed, high-entropy, unique secret", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(b);
    expect(secretHint(a)).toBe(a.slice(-4));
  });
  it("hashSecret is sha256 hex and never the secret itself", () => {
    const h = hashSecret(SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(SECRET);
    expect(hashSecret(SECRET)).toBe(h);
  });
});

describe("buildSignatureHeader / verifySignature", () => {
  it("signs `${t}.${body}` with HMAC-SHA256 and verifies", () => {
    const t = 1_760_000_000;
    const header = buildSignatureHeader(SECRET, BODY, t);
    const expected = createHmac("sha256", SECRET).update(`${t}.${BODY}`).digest("hex");
    expect(header).toBe(`t=${t},v1=${expected}`);
    expect(computeSignature(SECRET, t, BODY)).toBe(expected);
    expect(verifySignature(SECRET, header, BODY, { now: t + 10 })).toEqual({ ok: true, timestamp: t });
  });

  it("rejects a tampered body, a wrong secret and a malformed header", () => {
    const t = 1_760_000_000;
    const header = buildSignatureHeader(SECRET, BODY, t);
    expect(verifySignature(SECRET, header, BODY + " ", { now: t })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifySignature("whsec_other", header, BODY, { now: t })).toEqual({ ok: false, reason: "signature_mismatch" });
    expect(verifySignature(SECRET, "nonsense", BODY, { now: t })).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifySignature(SECRET, `t=${t}`, BODY, { now: t })).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifySignature(SECRET, `v1=${"a".repeat(64)}`, BODY, { now: t })).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifySignature(SECRET, null, BODY, { now: t })).toEqual({ ok: false, reason: "malformed_header" });
  });

  it("enforces the timestamp tolerance in both directions (default 300 s)", () => {
    const t = 1_760_000_000;
    const header = buildSignatureHeader(SECRET, BODY, t);
    expect(DEFAULT_TOLERANCE_SEC).toBe(300);
    expect(verifySignature(SECRET, header, BODY, { now: t + 300 }).ok).toBe(true);
    expect(verifySignature(SECRET, header, BODY, { now: t + 301 })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    expect(verifySignature(SECRET, header, BODY, { now: t - 301 })).toEqual({ ok: false, reason: "timestamp_out_of_tolerance" });
    expect(verifySignature(SECRET, header, BODY, { now: t + 1000, toleranceSec: 2000 }).ok).toBe(true);
  });

  it("accepts a header carrying several v1 signatures when one matches (key rotation)", () => {
    const t = 1_760_000_000;
    const good = computeSignature(SECRET, t, BODY);
    const header = `t=${t},v1=${"0".repeat(64)},v1=${good}`;
    expect(parseSignatureHeader(header)?.signatures).toHaveLength(2);
    expect(verifySignature(SECRET, header, BODY, { now: t }).ok).toBe(true);
  });
});

describe("sealSecret / openSecret", () => {
  it("round-trips with AES-GCM when a key is set and refuses tampering", () => {
    const env = { WEBHOOK_SECRET_KEY: "unit-test-key" } as NodeJS.ProcessEnv;
    const sealed = sealSecret(SECRET, env);
    expect(sealed.startsWith("gcm:")).toBe(true);
    expect(sealed).not.toContain(SECRET);
    expect(openSecret(sealed, env)).toBe(SECRET);
    const [p, iv, tag, data] = sealed.split(":");
    const flipped = data[0] === "A" ? "B" : "A";
    expect(openSecret(`${p}:${iv}:${tag}:${flipped}${data.slice(1)}`, env)).toBeNull();
    expect(openSecret(sealed, { WEBHOOK_SECRET_KEY: "another" } as NodeJS.ProcessEnv)).toBeNull();
  });
  it("falls back to OAUTH_TOKEN_ENCRYPTION_KEY, then to the obf: wrapper", () => {
    const env = { OAUTH_TOKEN_ENCRYPTION_KEY: "a".repeat(64) } as NodeJS.ProcessEnv;
    expect(openSecret(sealSecret(SECRET, env), env)).toBe(SECRET);
    const none = {} as NodeJS.ProcessEnv;
    const obf = sealSecret(SECRET, none);
    expect(obf.startsWith("obf:")).toBe(true);
    expect(openSecret(obf, none)).toBe(SECRET);
    expect(openSecret(null, none)).toBeNull();
    expect(openSecret("garbage", none)).toBeNull();
  });
});
