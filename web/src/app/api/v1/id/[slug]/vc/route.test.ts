/**
 * Colocated 6-case vitest for GET /api/v1/id/[slug]/vc.
 *
 * Pins the contract the /id and /embed/badge surfaces already depend on:
 *
 *   1. not-found slug → 404 (no side effects, no vc_issued insert)
 *   2. unindexed profile (`public_index=false`) → 404 (identical shape
 *      to 1 — never leak existence)
 *   3. happy path: no prior credential → mint fresh, insert vc_issued
 *      row with a stable jti, respond `ok:true` + jwt + credentialSubject
 *   4. cached path: recent non-revoked row exists → reuse the same jti
 *      (verifiable via `_meta.cached === true`), no new insert
 *   5. tampered JWT rejected via verifyVc — sanity that the wire format
 *      the endpoint emits round-trips through the verifier
 *   6. revoked credential (`revocation_id` set) → 410 Gone with the jti
 *      in the error body so verifiers surface the reason cleanly
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── readPublicProfile stub ─────────────────────────────────────────
const readPublicProfileMock = vi.fn();
vi.mock("@/lib/business-id/public-profile", () => ({
  readPublicProfile: (slug: string) => readPublicProfileMock(slug),
  PUBLIC_PROFILE_BASE_URL: "https://blockid.au",
}));

// ─── partner bearer verify stub (never called in these tests) ───────
vi.mock("@/lib/oauth2/verify-bearer", () => ({
  verifyPartnerBearer: vi.fn().mockResolvedValue({ ok: true }),
}));

// ─── rate-limit stub — always allow ─────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 999, resetIn: 60_000 }),
}));

// ─── supabase admin double ──────────────────────────────────────────
type QueryResult = { data: unknown; error: unknown };
const supaState: {
  projectRow: unknown;
  latestVc: unknown;
  insertErr: unknown;
  inserted: unknown[];
} = { projectRow: null, latestVc: null, insertErr: null, inserted: [] };

function makeAdmin() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.maybeSingle = async (): Promise<QueryResult> => {
        if (table === "projects") return { data: supaState.projectRow, error: null };
        if (table === "vc_issued") return { data: supaState.latestVc, error: null };
        return { data: null, error: null };
      };
      builder.insert = async (row: unknown) => {
        supaState.inserted.push(row);
        return { data: null, error: supaState.insertErr };
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => makeAdmin(),
}));

// ─── Real crypto path — inject a test keypair so signVc succeeds ────
import {
  __resetTestKeypair,
  __setTestKeypair,
  generateTestKeypair,
  verifyVc,
} from "@/lib/vc/issuer-keypair";

import { GET } from "./route";

function makeReq(url = "http://x/api/v1/id/acme/vc"): Request {
  return new Request(url, { method: "GET" });
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const PROFILE_ACME = {
  slug: "acme",
  legalName: "Acme Pty Ltd",
  verificationLevel: 3,
  trustScore: 72.5,
  lastVerifiedAt: "2026-07-20T00:00:00.000Z",
  badges: ["identity-verified", "evidence-checked", "trust-tier"],
  capabilityScores: {},
  attestations: [],
  jurisdiction: "AU",
  publicUrl: "https://blockid.au/id/acme",
};

beforeEach(() => {
  const { publicKey, privateKey } = generateTestKeypair();
  __setTestKeypair(publicKey, privateKey);

  readPublicProfileMock.mockReset();
  supaState.projectRow = null;
  supaState.latestVc = null;
  supaState.insertErr = null;
  supaState.inserted = [];
});

afterEach(() => {
  __resetTestKeypair();
});

describe("GET /api/v1/id/[slug]/vc", () => {
  it("[case 1] returns 404 when the profile does not exist", async () => {
    readPublicProfileMock.mockResolvedValue(null);
    const res = await GET(makeReq(), ctx("missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("not_found");
    expect(supaState.inserted.length).toBe(0);
  });

  it("[case 2] returns 404 for an unindexed profile (public_index=false → readPublicProfile returns null)", async () => {
    // readPublicProfile already applies the public_index filter, so an
    // unindexed row surfaces here as null — same 404 shape as case 1.
    readPublicProfileMock.mockResolvedValue(null);
    const res = await GET(makeReq("http://x/api/v1/id/private/vc"), ctx("private"));
    expect(res.status).toBe(404);
    expect(supaState.inserted.length).toBe(0);
  });

  it("[case 3] happy path: mints a fresh credential and inserts a vc_issued row", async () => {
    readPublicProfileMock.mockResolvedValue(PROFILE_ACME);
    supaState.projectRow = { id: "proj-uuid-1" };
    supaState.latestVc = null;

    const res = await GET(makeReq(), ctx("acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(body.jti).toMatch(/^urn:uuid:/);
    expect(body.credentialSubject.slug).toBe("acme");
    expect(body.credentialSubject.verificationLevel).toBe(3);
    expect(body._meta.cached).toBe(false);

    expect(supaState.inserted.length).toBe(1);
    const inserted = supaState.inserted[0] as Record<string, unknown>;
    expect(inserted.jti).toBe(body.jti);
    expect(inserted.subject_business_id).toBe("proj-uuid-1");
    expect(inserted.credential_type).toBe("BusinessIdentity");
    expect(inserted.payload_hash).toMatch(/^blockid:v1:[0-9a-f]{64}$/);
  });

  it("[case 4] cached path: reuses the existing jti and does NOT insert a new row", async () => {
    readPublicProfileMock.mockResolvedValue(PROFILE_ACME);
    supaState.projectRow = { id: "proj-uuid-1" };
    supaState.latestVc = {
      jti: "urn:uuid:existing-1234",
      issued_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5d old
      expires_at: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString(),
      revocation_id: null,
      payload_hash: "blockid:v1:" + "a".repeat(64),
    };

    const res = await GET(makeReq(), ctx("acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jti).toBe("urn:uuid:existing-1234");
    expect(body._meta.cached).toBe(true);
    expect(supaState.inserted.length).toBe(0);
  });

  it("[case 5] emitted JWT round-trips through verifyVc; a tampered one is rejected", async () => {
    readPublicProfileMock.mockResolvedValue(PROFILE_ACME);
    supaState.projectRow = { id: "proj-uuid-1" };

    const res = await GET(makeReq(), ctx("acme"));
    const body = await res.json();
    const parsed = await verifyVc(body.jwt);
    expect(parsed).not.toBeNull();
    expect(parsed?.jti).toBe(body.jti);
    expect(parsed?.vc.credentialSubject).toMatchObject({ slug: "acme" });

    // Flip a byte in the signature segment.
    const parts = body.jwt.split(".");
    const bad = (parts[2].startsWith("A") ? "B" : "A") + parts[2].slice(1);
    const tampered = `${parts[0]}.${parts[1]}.${bad}`;
    expect(await verifyVc(tampered)).toBeNull();
  });

  it("[case 6] returns 410 when the latest credential has been revoked", async () => {
    readPublicProfileMock.mockResolvedValue(PROFILE_ACME);
    supaState.projectRow = { id: "proj-uuid-1" };
    supaState.latestVc = {
      jti: "urn:uuid:revoked-9999",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revocation_id: "rev-uuid-1",
      payload_hash: "blockid:v1:" + "b".repeat(64),
    };

    const res = await GET(makeReq(), ctx("acme"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("revoked");
    expect(body.error.jti).toBe("urn:uuid:revoked-9999");
    expect(supaState.inserted.length).toBe(0);
  });
});
