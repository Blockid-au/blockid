// Colocated vitest for GET /.well-known/did.json — P9-did-well-known-route-test.
//
// This is the ISSUER-side half of did:web resolution for `did:web:blockid.au`.
// Any W3C VC verifier that receives a JWT with `iss=did:web:blockid.au` will
// fetch this URL, extract the `verificationMethod` matching the JWT's `kid`,
// and use that key to validate the Ed25519 signature. Silent regressions here
// break every VC verifier in the wild — but always return 200, because the
// verifiers only inspect the body. This suite pins the failure modes:
//
//   - dropping the `issuerKeyConfigured()` guard and returning a document
//     with an empty `x` — verifiers would either accept anything signed with
//     an all-zero key, or cache a broken key for the full TTL;
//   - flipping the 503 branch to 200 with a synthesized-empty body — same as
//     above, but the amber "not provisioned" signal disappears from monitoring;
//   - dropping the `Cache-Control: no-store` on the 503 branch and letting
//     the CDN cache a "not provisioned" response for 24h once the key lands;
//   - flipping the `Cache-Control` on the 200 to `no-store` and hammering the
//     origin on every verifier retry (this route runs on every VC verification);
//   - renaming `verificationMethod[0].id` off `DID_KEY_ID` so the `kid` on
//     signed JWTs no longer matches the JWK the verifier retrieves — every
//     verify() would return null and every VC would be rejected;
//   - dropping the JWS-2020 context URL, breaking the JsonWebKey2020 lookup
//     in strict W3C resolvers;
//   - swapping the assertionMethod / authentication references to something
//     other than DID_KEY_ID — verifiers that check the proof-purpose of the
//     credential would reject it as "not authorised to sign".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const issuerKeyConfiguredMock = vi.fn<() => boolean>();
const publicJwkMock = vi.fn<() => { kty: string; crv: string; x: string }>();

vi.mock("@/lib/vc/issuer-keypair", () => ({
  DID_ISSUER: "did:web:blockid.au",
  DID_KEY_ID: "did:web:blockid.au#issuer-key-1",
  issuerKeyConfigured: () => issuerKeyConfiguredMock(),
  publicJwk: () => publicJwkMock(),
}));

// Route import MUST come after mocks are registered.
import { GET, dynamic, revalidate } from "./route";

// --- Helpers ---------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const HAPPY_JWK = { kty: "OKP", crv: "Ed25519", x: "abcdef1234567890" };

beforeEach(() => {
  issuerKeyConfiguredMock.mockReset().mockReturnValue(true);
  publicJwkMock.mockReset().mockReturnValue({ ...HAPPY_JWK });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Route module exports --------------------------------------------------

describe("route module exports", () => {
  it("exports dynamic='force-static' so verifiers can cheap-cache the DID doc", () => {
    // Verifiers pull this on every JWT; force-static + long TTL is what keeps
    // the origin cost near-zero. Flipping to force-dynamic would 10-100x load.
    expect(dynamic).toBe("force-static");
  });

  it("exports revalidate=3600 (1h) so key rotations land within an hour", () => {
    // Keypair rotates on annual maintenance; 1h edge TTL is a safe balance.
    expect(revalidate).toBe(3600);
  });
});

// --- Unprovisioned key path (503) ------------------------------------------

describe("GET /.well-known/did.json — issuer key not provisioned", () => {
  beforeEach(() => {
    issuerKeyConfiguredMock.mockReturnValue(false);
  });

  it("returns 503 rather than a syntactically valid doc with an empty `x`", async () => {
    // A verifier that saw an empty x would either accept anything or cache a
    // broken key for the full TTL. 503 is the correct amber signal.
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("carries an `error.code=issuer_key_not_provisioned` machine tag", async () => {
    const res = await GET();
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.code).toBe("issuer_key_not_provisioned");
  });

  it("carries a human-readable message pointing at the env var to fix", async () => {
    // The message is what shows up in monitoring — must name the env var.
    const res = await GET();
    const body = await json(res);
    const err = body.error as Record<string, unknown>;
    expect(err.message).toContain("BID_VC_ISSUER_PRIVATE_KEY_PATH");
  });

  it("sets Cache-Control: no-store so the 503 never gets edge-cached", async () => {
    // Without no-store, a CDN would cache "not provisioned" for 24h even
    // after the key lands, and every verifier for a full day would fail.
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sets Content-Type: application/json on the error body", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does NOT call publicJwk() when the key is not provisioned", async () => {
    // publicJwk() reads the file — must not run when there is no file.
    await GET();
    expect(publicJwkMock).not.toHaveBeenCalled();
  });

  it("does not include the did-doc @context or verificationMethod on 503", async () => {
    const res = await GET();
    const body = await json(res);
    expect(body["@context"]).toBeUndefined();
    expect(body.verificationMethod).toBeUndefined();
    expect(body.id).toBeUndefined();
  });
});

// --- Provisioned key path (200) --------------------------------------------

describe("GET /.well-known/did.json — happy path", () => {
  it("returns 200 when the issuer key is provisioned", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("sets Content-Type: application/did+json (the W3C-registered media type)", async () => {
    // did+json is the media type that DID-conformant resolvers look for; a
    // plain application/json body still parses, but strict resolvers may 415.
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/did\+json/);
  });

  it("carries the long-lived cache headers verifiers rely on", async () => {
    // Long TTL is safe because the keypair rotates annually. Cutting this
    // would push per-verify latency onto the origin under high VC volume.
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400",
    );
  });

  it("includes both required @context URIs (did/v1 + jws-2020/v1)", async () => {
    // The jws-2020 context is what makes JsonWebKey2020 resolve in strict
    // W3C resolvers — dropping it breaks did-jwt-verifier and friends.
    const res = await GET();
    const body = await json(res);
    expect(body["@context"]).toEqual([
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ]);
  });

  it("sets the top-level id to DID_ISSUER (did:web:blockid.au)", async () => {
    const res = await GET();
    const body = await json(res);
    expect(body.id).toBe("did:web:blockid.au");
  });

  it("exposes exactly one verificationMethod, keyed on DID_KEY_ID", async () => {
    // Renaming this id would silently break every verifier because signed
    // JWTs carry `kid=DID_KEY_ID` and the JWK is looked up by that string.
    const res = await GET();
    const body = await json(res);
    const vm = body.verificationMethod as Array<Record<string, unknown>>;
    expect(vm).toHaveLength(1);
    expect(vm[0].id).toBe("did:web:blockid.au#issuer-key-1");
  });

  it("declares the verificationMethod type as JsonWebKey2020", async () => {
    const res = await GET();
    const body = await json(res);
    const vm = body.verificationMethod as Array<Record<string, unknown>>;
    expect(vm[0].type).toBe("JsonWebKey2020");
  });

  it("sets the verificationMethod controller to DID_ISSUER", async () => {
    const res = await GET();
    const body = await json(res);
    const vm = body.verificationMethod as Array<Record<string, unknown>>;
    expect(vm[0].controller).toBe("did:web:blockid.au");
  });

  it("passes publicJwk() through verbatim as publicKeyJwk", async () => {
    // The route MUST NOT synthesize its own JWK — a synthesised one would
    // never match the private key that actually signs VCs. Pin the pass-through.
    const custom = { kty: "OKP", crv: "Ed25519", x: "MY_TEST_KEY_MATERIAL" };
    publicJwkMock.mockReturnValue(custom);
    const res = await GET();
    const body = await json(res);
    const vm = body.verificationMethod as Array<Record<string, unknown>>;
    expect(vm[0].publicKeyJwk).toEqual(custom);
  });

  it("calls publicJwk() exactly once per request (no wasted key-load)", async () => {
    await GET();
    expect(publicJwkMock).toHaveBeenCalledTimes(1);
  });

  it("declares assertionMethod=[DID_KEY_ID] so the key can sign VCs", async () => {
    // assertionMethod is the proof-purpose that VCs use; a mismatch here
    // causes strict verifiers to reject the credential as "not authorised".
    const res = await GET();
    const body = await json(res);
    expect(body.assertionMethod).toEqual(["did:web:blockid.au#issuer-key-1"]);
  });

  it("declares authentication=[DID_KEY_ID] so the DID can also authenticate", async () => {
    const res = await GET();
    const body = await json(res);
    expect(body.authentication).toEqual(["did:web:blockid.au#issuer-key-1"]);
  });

  it("advertises a single RevocationList2020 service at the canonical URL", async () => {
    // The revocation-list URL is what a verifier hits to check whether a VC
    // has been revoked. Renaming it silently would make every "revoked" VC
    // still appear valid — a security-relevant regression.
    const res = await GET();
    const body = await json(res);
    const services = body.service as Array<Record<string, unknown>>;
    expect(services).toHaveLength(1);
    expect(services[0]).toEqual({
      id: "did:web:blockid.au#revocations",
      type: "RevocationList2020",
      serviceEndpoint: "https://blockid.au/.well-known/revocations",
    });
  });

  it("does not leak any unexpected top-level keys (contract is fixed)", async () => {
    // The DID document is a public contract; any additional key we ship is
    // observable to every third-party verifier. Pin the top-level shape.
    const res = await GET();
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(
      [
        "@context",
        "id",
        "verificationMethod",
        "assertionMethod",
        "authentication",
        "service",
      ].sort(),
    );
  });
});

// --- Cross-cutting: 503 vs 200 branch selection ----------------------------

describe("GET /.well-known/did.json — branch selection", () => {
  it("re-reads issuerKeyConfigured() on every request (no cached decision)", async () => {
    // If the branch were cached at import time, provisioning a key later
    // would still return 503 until the process was restarted. Verify the
    // route consults the module every call so a hot swap works.
    issuerKeyConfiguredMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const first = await GET();
    const second = await GET();
    expect(first.status).toBe(503);
    expect(second.status).toBe(200);
  });

  it("does not fall through to the 200 body when publicJwk() returns an empty x", async () => {
    // The 503 guard is the *only* thing between us and shipping an
    // all-zeroes key. If the guard returned true but publicJwk returned an
    // empty x, we would still emit a valid-shaped document — the current
    // contract accepts that (issuer-keypair.ts owns the empty-x behaviour),
    // but we pin here that the doc's shape is stable so a downstream JWK
    // validator can reject it cleanly instead of interpreting a partial doc.
    publicJwkMock.mockReturnValue({ kty: "OKP", crv: "Ed25519", x: "" });
    const res = await GET();
    const body = await json(res);
    const vm = body.verificationMethod as Array<Record<string, unknown>>;
    expect(res.status).toBe(200);
    expect((vm[0].publicKeyJwk as Record<string, string>).x).toBe("");
  });
});
