/**
 * GET /api/v1/id/[slug]/vc
 *
 * Emits (or reuses) the current W3C Verifiable Credential JWT for a public
 * Business Identity profile. Master Upgrade Plan §11.1 + §5.6 BCR-*.
 *
 * Contract:
 *   • Anonymous is allowed — the underlying `/id/[slug]` page is already
 *     public per §14bis D3, so signing a JWT off the same PII-whitelisted
 *     projection cannot leak new data.
 *   • Optional Bearer auth lifts the caller into the partner rate-limit
 *     tier (`id:public:read` scope, same as the JSON endpoint next door).
 *   • If the caller's Business is unindexed / missing → 404 (never 200
 *     with an empty payload — that would let anonymous scrapers enumerate
 *     the slug space).
 *   • If the most-recent credential for the subject has been revoked (row
 *     has `revocation_id`) → 410 Gone so verifiers stop retrying.
 *   • Otherwise: return `{ jwt, expiresAt, credentialSubject }`. If a
 *     non-revoked credential exists and is younger than the refresh
 *     window (60d), reuse it verbatim so the JTI stays stable for
 *     downstream badge holders. Otherwise mint a fresh one, insert a
 *     vc_issued row, and best-effort queue an Anvil anchor.
 *
 * Cache: 5 min browser, 1 h CDN, SWR 60s — same envelope as the sibling
 * public-profile JSON endpoint.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { readPublicProfile } from "@/lib/business-id/public-profile";
import { verifyPartnerBearer } from "@/lib/oauth2/verify-bearer";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import { signVc, DID_ISSUER } from "@/lib/vc/issuer-keypair";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=60";

// Reuse an existing credential when it was issued within this many
// milliseconds. Refresh cadence is deliberately shorter than the JWT TTL
// so verifiers see a rotated key well before the outer signature dies.
const REUSE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

// TTL on emitted JWTs: 90 days. Longer than reuse window so a client that
// caches the JWT briefly (5m) always sees a valid one across the refresh.
const JWT_TTL_SECONDS = 90 * 24 * 60 * 60;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * Best-effort Anvil anchor. We deliberately never `await` it from the
 * request path — the anchor cron will pick up any row where
 * `anchor_tx IS NULL` and batch it into the day's Merkle root.
 */
function queueAnchor(jti: string, payloadHash: string): void {
  // Intentional fire-and-forget. The queue insert is idempotent because
  // the anchor cron dedupes on payload_hash before hashing into the tree.
  Promise.resolve().then(async () => {
    try {
      const admin = getSupabaseAdmin();
      if (!admin) return;
      // The anchor cron reads vc_issued.anchor_tx IS NULL — nothing to do
      // here unless we grow a separate queue table later. Log-level trace
      // only; never `console.log` the JWT itself.
      void jti;
      void payloadHash;
    } catch {
      // Anchor is a transparency layer, not a correctness dependency.
    }
  });
}

export async function GET(req: NextRequest, ctx: RouteParams) {
  const { slug } = await ctx.params;

  // ─── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  let authenticated = false;
  if (authHeader) {
    const decision = await verifyPartnerBearer(authHeader, "id:public:read");
    if (!decision.ok) {
      return NextResponse.json(
        {
          error: {
            code: "unauthorized",
            message: `Partner bearer rejected (${decision.reason}). Anonymous requests may omit the Authorization header.`,
          },
        },
        { status: 401, headers: CORS },
      );
    }
    authenticated = true;
  }

  // ─── Rate limit ────────────────────────────────────────────────
  const limitMax = authenticated ? 600 : 60;
  const bucketKey = authenticated
    ? `api:v1:vc:auth:${authHeader?.slice(-16) ?? "unk"}`
    : `api:v1:vc:anon:${clientIp(req)}`;
  const rl = checkRateLimit(bucketKey, limitMax, 60_000);
  if (!rl.allowed) {
    const retrySeconds = Math.ceil(rl.resetIn / 1000);
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded (${limitMax}/min). Retry in ${retrySeconds}s.`,
          retryInSeconds: retrySeconds,
        },
      },
      { status: 429, headers: { ...CORS, "Retry-After": String(retrySeconds) } },
    );
  }

  // ─── Read the public profile ───────────────────────────────────
  const profile = await readPublicProfile(slug);
  if (!profile) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Business profile not found." } },
      { status: 404, headers: CORS },
    );
  }

  // ─── Resolve the underlying project row (need id + owner) ─────
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: { code: "unavailable", message: "Store unavailable." } },
      { status: 503, headers: CORS },
    );
  }

  const { data: proj } = await admin
    .from("projects")
    .select("id")
    .eq("public_slug", slug)
    .eq("public_index", true)
    .maybeSingle();

  if (!proj?.id) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Business profile not found." } },
      { status: 404, headers: CORS },
    );
  }

  const subjectBusinessId = proj.id as string;

  // ─── Look up the most-recent BusinessIdentity credential ──────
  const { data: latest } = await admin
    .from("vc_issued")
    .select("jti, issued_at, expires_at, revocation_id, payload_hash")
    .eq("subject_business_id", subjectBusinessId)
    .eq("credential_type", "BusinessIdentity")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.revocation_id) {
    return NextResponse.json(
      {
        error: {
          code: "revoked",
          message: "This credential has been revoked. Contact the owner for a fresh one.",
          jti: latest.jti,
        },
      },
      { status: 410, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  const now = Date.now();
  const canReuse =
    latest &&
    latest.issued_at &&
    now - new Date(latest.issued_at).getTime() < REUSE_WINDOW_MS &&
    (!latest.expires_at || new Date(latest.expires_at).getTime() > now);

  // Build the W3C credentialSubject from the whitelisted profile. This is
  // the ONLY shape signed into the JWT — no PII beyond what the /id page
  // already exposes.
  const credentialSubject = {
    id: profile.publicUrl,
    slug: profile.slug,
    legalName: profile.legalName,
    verificationLevel: profile.verificationLevel,
    trustScore: profile.trustScore,
    badges: profile.badges,
    jurisdiction: profile.jurisdiction,
    lastVerifiedAt: profile.lastVerifiedAt,
  };

  // ─── Cached path ───────────────────────────────────────────────
  if (canReuse && latest) {
    // Re-mint the JWT with the same jti so the on-wire signature stays
    // fresh (Ed25519 is deterministic — same input, same signature).
    // We rehydrate `iat/exp` from the reused row so the client's cache
    // window matches the DB row exactly.
    const reissuedJwt = await signVc({
      sub: profile.publicUrl,
      jti: latest.jti,
      ttlSeconds: latest.expires_at
        ? Math.max(60, Math.floor((new Date(latest.expires_at).getTime() - now) / 1000))
        : JWT_TTL_SECONDS,
      vc: {
        "@context": [
          "https://www.w3.org/2018/credentials/v1",
          "https://blockid.au/schemas/business-identity/v1",
        ],
        type: ["VerifiableCredential", "BusinessIdentity"],
        credentialSubject,
        issuer: DID_ISSUER,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        jwt: reissuedJwt,
        jti: latest.jti,
        issuedAt: latest.issued_at,
        expiresAt: latest.expires_at,
        credentialSubject,
        _meta: { cached: true, authenticated, rateLimitRemaining: rl.remaining },
      },
      { status: 200, headers: { ...CORS, "Cache-Control": CACHE_CONTROL } },
    );
  }

  // ─── Mint a fresh credential ───────────────────────────────────
  const jti = `urn:uuid:${randomUUID()}`;
  const vcBody = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://blockid.au/schemas/business-identity/v1",
    ],
    type: ["VerifiableCredential", "BusinessIdentity"],
    credentialSubject,
    issuer: DID_ISSUER,
  };

  // Hash the canonical VC body BEFORE we sign — this is what the anchor
  // cron writes to Anvil, and what a verifier re-derives to prove the
  // credential existed at issuance time.
  const payloadHash = hashScore(canonicalizeScore(vcBody));

  let jwt: string;
  try {
    jwt = await signVc({
      sub: profile.publicUrl,
      jti,
      ttlSeconds: JWT_TTL_SECONDS,
      vc: vcBody,
    });
  } catch (err) {
    // Fail-fast when the issuer key isn't provisioned — we do NOT fall
    // back to an unsigned response.
    return NextResponse.json(
      {
        error: {
          code: "issuer_unavailable",
          message: err instanceof Error ? err.message : "VC issuer unavailable.",
        },
      },
      { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(now + JWT_TTL_SECONDS * 1000).toISOString();

  const { error: insertErr } = await admin.from("vc_issued").insert({
    jti,
    subject_business_id: subjectBusinessId,
    credential_type: "BusinessIdentity",
    verification_level: profile.verificationLevel,
    issued_at: nowIso,
    expires_at: expiresIso,
    payload_hash: payloadHash,
  });

  if (insertErr) {
    // A duplicate `jti` (astronomically unlikely with randomUUID) or an
    // FK violation means we cannot honor a stable jti — bail rather than
    // hand back a JWT the revocation registry cannot target.
    return NextResponse.json(
      {
        error: {
          code: "issue_failed",
          message: "Could not record credential issuance.",
        },
      },
      { status: 500, headers: { ...CORS, "Cache-Control": "no-store" } },
    );
  }

  queueAnchor(jti, payloadHash);

  return NextResponse.json(
    {
      ok: true,
      jwt,
      jti,
      issuedAt: nowIso,
      expiresAt: expiresIso,
      credentialSubject,
      _meta: { cached: false, authenticated, rateLimitRemaining: rl.remaining },
    },
    { status: 200, headers: { ...CORS, "Cache-Control": CACHE_CONTROL } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
