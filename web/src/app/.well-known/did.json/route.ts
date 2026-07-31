/**
 * `/.well-known/did.json` — did:web:blockid.au DID document.
 *
 * Master Upgrade Plan §11.1 (BCR-* VC lane). Serves the ISSUER-side half of
 * did:web resolution: any conformant W3C VC verifier that receives a JWT
 * with `iss = did:web:blockid.au` will fetch this URL, extract the
 * `verificationMethod` matching the JWT's `kid`, and use that key to
 * validate the Ed25519 signature.
 *
 * Cache: 1 h at the browser edge, 24 h at the CDN. The keypair rotates
 * on human-scheduled maintenance (annual by default), not per-request —
 * a long TTL is safe and keeps verifiers cheap.
 *
 * If the issuer key is not yet provisioned (dev / bootstrapping the VPS)
 * we return 503 rather than a syntactically valid document with an empty
 * `x` — a verifier that saw an empty key would either accept anything or
 * cache a broken key for the full TTL.
 */

import { NextResponse } from "next/server";
import {
  DID_ISSUER,
  DID_KEY_ID,
  issuerKeyConfigured,
  publicJwk,
} from "@/lib/vc/issuer-keypair";

export const dynamic = "force-static";
export const revalidate = 3600;

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

export async function GET() {
  if (!issuerKeyConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "issuer_key_not_provisioned",
          message:
            "BlockID VC issuer key is not yet configured on this instance. " +
            "Retry once BID_VC_ISSUER_PRIVATE_KEY_PATH is provisioned.",
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      },
    );
  }

  const jwk = publicJwk();

  const doc = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ],
    id: DID_ISSUER,
    verificationMethod: [
      {
        id: DID_KEY_ID,
        type: "JsonWebKey2020",
        controller: DID_ISSUER,
        publicKeyJwk: jwk,
      },
    ],
    assertionMethod: [DID_KEY_ID],
    authentication: [DID_KEY_ID],
    service: [
      {
        id: `${DID_ISSUER}#revocations`,
        type: "RevocationList2020",
        serviceEndpoint: "https://blockid.au/.well-known/revocations",
      },
    ],
  };

  return NextResponse.json(doc, {
    status: 200,
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Type": "application/did+json",
    },
  });
}
