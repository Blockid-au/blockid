// S20-B — signing + verification (Stripe-style t=,v1=) and secret sealing.
import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
  WEBHOOK_VERIFY_EXPRESS_EXAMPLE,
  WEBHOOK_VERIFY_SNIPPET,
  WebhookSealKeyMissingError,
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
  it("P2-4: in production sealSecret throws without a key instead of storing an obf: wrapper", () => {
    const prodNoKey = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    expect(() => sealSecret(SECRET, prodNoKey)).toThrow(WebhookSealKeyMissingError);
    expect(() => sealSecret(SECRET, prodNoKey)).toThrow(/WEBHOOK_SECRET_KEY/);
    // With a key, production seals normally; outside production the dev fallback stays.
    const prodKey = { NODE_ENV: "production", WEBHOOK_SECRET_KEY: "k" } as NodeJS.ProcessEnv;
    expect(sealSecret(SECRET, prodKey).startsWith("gcm:")).toBe(true);
    expect(sealSecret(SECRET, { NODE_ENV: "test" } as NodeJS.ProcessEnv).startsWith("obf:")).toBe(true);
  });
  it("P2-4: openSecret refuses an obf: row once a key is configured (logged, null → fail closed)", () => {
    const none = {} as NodeJS.ProcessEnv;
    const obf = sealSecret(SECRET, none);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(openSecret(obf, { WEBHOOK_SECRET_KEY: "k" } as NodeJS.ProcessEnv)).toBeNull();
      expect(openSecret(obf, { OAUTH_TOKEN_ENCRYPTION_KEY: "k" } as NodeJS.ProcessEnv)).toBeNull();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(String(spy.mock.calls[0][0])).toMatch(/refusing obf:/);
    } finally {
      spy.mockRestore();
    }
    // Keyless dev still opens it.
    expect(openSecret(obf, none)).toBe(SECRET);
  });
});

// ── S20-B review P2-5: the /docs reference verifier is executed here ───────

type Verify = (rawBody: string, header: string, secret: string, toleranceSec?: number, nowSec?: number) => boolean;

/** Turn the published snippet into a callable (strip the import + export; inject node:crypto). */
function loadSnippet(): Verify {
  const body = WEBHOOK_VERIFY_SNIPPET.split("\n")
    .filter((l) => !l.startsWith("import "))
    .join("\n")
    .replace("export function", "function");
  const factory = new Function("createHmac", "timingSafeEqual", "Buffer", `${body}\nreturn verifyBlockIdWebhook;`);
  return factory(createHmac, timingSafeEqual, Buffer) as Verify;
}

describe("docs reference verifier (WEBHOOK_VERIFY_SNIPPET)", () => {
  const verify = loadSnippet();
  const now = 1_800_000_000;
  const header = buildSignatureHeader(SECRET, BODY, now);

  it("agrees with verifySignature on the full matrix — and never throws", () => {
    const hex64NonHex = "g".repeat(64);
    const cases: Array<[string, string, string, number | undefined, number]> = [
      [BODY, header, SECRET, undefined, now],
      [BODY, header, "whsec_wrong", undefined, now],
      [`${BODY} `, header, SECRET, undefined, now],
      [BODY, header, SECRET, undefined, now + DEFAULT_TOLERANCE_SEC],
      [BODY, header, SECRET, undefined, now + DEFAULT_TOLERANCE_SEC + 1],
      [BODY, header, SECRET, undefined, now - DEFAULT_TOLERANCE_SEC - 1],
      [BODY, header, SECRET, 10, now + 11],
      [BODY, `t=${now},v1=${hex64NonHex}`, SECRET, undefined, now], // old snippet: RangeError
      [BODY, `t=${now},v1=abc`, SECRET, undefined, now],
      [BODY, `t=${now}`, SECRET, undefined, now],
      [BODY, `v1=${header.split("v1=")[1]}`, SECRET, undefined, now],
      [BODY, `t=abc,v1=${header.split("v1=")[1]}`, SECRET, undefined, now],
      [BODY, `t=-5,v1=${header.split("v1=")[1]}`, SECRET, undefined, now],
      [BODY, "", SECRET, undefined, now],
      [BODY, `t=${now},v1=${"0".repeat(64)},v1=${header.split("v1=")[1]}`, SECRET, undefined, now], // rotation: second matches
      [BODY, `t=${now},v1=${header.split("v1=")[1].toUpperCase()}`, SECRET, undefined, now],
      [BODY, ` t = ${now} , v1 = ${header.split("v1=")[1]} `, SECRET, undefined, now],
    ];
    for (const [body, h, secret, tol, at] of cases) {
      const reference = verifySignature(secret, h, body, { toleranceSec: tol, now: at }).ok;
      let got: boolean | "threw" = "threw";
      try {
        got = verify(body, h, secret, tol, at);
      } catch {
        // stays "threw"
      }
      expect(got, `header=${JSON.stringify(h)} secret=${secret} now=${at}`).toBe(reference);
    }
    expect(verify(BODY, header, SECRET, undefined, now)).toBe(true);
    expect(verify(BODY, `t=${now},v1=${hex64NonHex}`, SECRET, undefined, now)).toBe(false);
  });

  it("validates hex before the constant-time compare and defaults to a 300 s tolerance", () => {
    expect(WEBHOOK_VERIFY_SNIPPET).toContain("/^[0-9a-f]{64}$/i");
    expect(WEBHOOK_VERIFY_SNIPPET).toContain("got.length === expected.length && timingSafeEqual(got, expected)");
    expect(WEBHOOK_VERIFY_SNIPPET).toContain("toleranceSec = 300");
    expect(WEBHOOK_VERIFY_EXPRESS_EXAMPLE).toContain('req.get("X-BlockID-Signature")');
    // Live-clock default path.
    expect(verify(BODY, buildSignatureHeader(SECRET, BODY), SECRET)).toBe(true);
  });
});
