/**
 * Colocated 8-case vitest for the Ed25519 VC issuer keypair.
 *
 * Uses `generateTestKeypair()` + `__setTestKeypair()` — NEVER touches the
 * production `BID_VC_ISSUER_PRIVATE_KEY_PEM` env. The suite pins:
 *
 *   1. sign → verify round-trip returns the same payload,
 *   2. tampered signature is rejected,
 *   3. tampered payload is rejected,
 *   4. expired `exp` is rejected,
 *   5. wrong issuer (`iss`) is rejected,
 *   6. malformed JWT (wrong segment count) is rejected,
 *   7. `publicJwk()` returns the OKP/Ed25519 shape did:web resolvers expect,
 *   8. fail-fast: `signVc` throws when no key is configured (mimics prod boot).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetTestKeypair,
  __setTestKeypair,
  DID_ISSUER,
  generateTestKeypair,
  publicJwk,
  signVc,
  verifyVc,
  VC_JWT_ALG,
} from "./issuer-keypair";

function baseInput() {
  return {
    sub: "https://blockid.au/id/acme",
    jti: "urn:uuid:00000000-0000-0000-0000-0000000000aa",
    vc: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", "BusinessIdentity"],
      credentialSubject: { id: "https://blockid.au/id/acme", verificationLevel: 3 },
    },
  };
}

describe("vc/issuer-keypair", () => {
  beforeEach(() => {
    const { publicKey, privateKey } = generateTestKeypair();
    __setTestKeypair(publicKey, privateKey);
  });

  afterEach(() => {
    __resetTestKeypair();
  });

  it("round-trips: signVc then verifyVc returns matching payload", async () => {
    const jwt = await signVc(baseInput());
    const parsed = await verifyVc(jwt);
    expect(parsed).not.toBeNull();
    expect(parsed?.iss).toBe(DID_ISSUER);
    expect(parsed?.sub).toBe("https://blockid.au/id/acme");
    expect(parsed?.jti).toBe("urn:uuid:00000000-0000-0000-0000-0000000000aa");
    expect(parsed?.vc.type).toContain("BusinessIdentity");
  });

  it("rejects a tampered signature segment", async () => {
    const jwt = await signVc(baseInput());
    const parts = jwt.split(".");
    // Flip a byte in the sig (still valid base64url chars).
    const bad = parts[2].startsWith("A") ? "B" + parts[2].slice(1) : "A" + parts[2].slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${bad}`;
    expect(await verifyVc(tampered)).toBeNull();
  });

  it("rejects a tampered payload segment (signature no longer covers it)", async () => {
    const jwt = await signVc(baseInput());
    const parts = jwt.split(".");
    // Craft a completely new payload with a bumped verificationLevel.
    const evil = Buffer.from(
      JSON.stringify({ iss: DID_ISSUER, sub: "x", iat: 0, nbf: 0, exp: 9999999999, jti: "x", vc: {} }),
      "utf8",
    )
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(await verifyVc(`${parts[0]}.${evil}.${parts[2]}`)).toBeNull();
  });

  it("rejects an expired credential (exp in the past)", async () => {
    const jwt = await signVc({ ...baseInput(), ttlSeconds: 60 });
    // Fast-forward 2 minutes past exp using Date.now.
    const realNow = Date.now;
    Date.now = () => realNow() + 5 * 60 * 1000;
    try {
      expect(await verifyVc(jwt)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("rejects a JWT with the wrong issuer (`iss`)", async () => {
    const jwt = await signVc(baseInput());
    const [h, p, s] = jwt.split(".");
    const payloadStr = Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(payloadStr);
    parsed.iss = "did:web:evil.example";
    const rebuilt = Buffer.from(JSON.stringify(parsed), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(await verifyVc(`${h}.${rebuilt}.${s}`)).toBeNull();
  });

  it("rejects a malformed JWT (wrong segment count)", async () => {
    expect(await verifyVc("not.a-real-jwt")).toBeNull();
    expect(await verifyVc("")).toBeNull();
    expect(await verifyVc("a.b.c.d")).toBeNull();
  });

  it("publicJwk returns OKP/Ed25519 with an `x` component", () => {
    const jwk = publicJwk();
    expect(jwk.kty).toBe("OKP");
    expect(jwk.crv).toBe("Ed25519");
    expect(jwk.x.length).toBeGreaterThan(20);
    // base64url alphabet only
    expect(jwk.x).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("fail-fast: signVc throws when no issuer key is configured", async () => {
    __resetTestKeypair();
    const priorEnv = process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM;
    delete process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM;
    try {
      await expect(signVc(baseInput())).rejects.toThrow(/BID_VC_ISSUER_PRIVATE_KEY_PEM/);
    } finally {
      if (priorEnv !== undefined) process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM = priorEnv;
    }
    // Header alg pin so a silent switch to RSA/ES256 would fail the suite.
    expect(VC_JWT_ALG).toBe("EdDSA");
  });
});
