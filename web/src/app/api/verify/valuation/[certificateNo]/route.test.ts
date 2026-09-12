// Colocated tests for the public GET /api/verify/valuation/[certificateNo] (S22-A).
//
//   valid → 200 with status/startup/issued/hash flags and NO figures;
//   revoked → 200 status "revoked"; tampered payload → "hash_mismatch";
//   unknown / malformed → 404; `?hash=` compared against the record.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { SAMPLE_CERTIFICATE as SAMPLE } from "@/lib/valuation-certificate/fixtures";
import { certificateContentHash } from "@/lib/valuation-certificate/hash";

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

import { GET } from "./route";

const HASH = certificateContentHash(SAMPLE);

function row(over: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    project_id: "proj-1",
    user_id: "u-1",
    certificate_no: SAMPLE.certificateNo,
    content_hash: HASH,
    payload: SAMPLE,
    startup_name: SAMPLE.startupName,
    svi_score: SAMPLE.sviScore,
    credits_charged: 5,
    issued_at: SAMPLE.issuedAt,
    revoked_at: null,
    revoked_reason: null,
    ...over,
  };
}

function call(no: string, query = "") {
  const req = new Request(`http://localhost/api/verify/valuation/${encodeURIComponent(no)}${query}`) as unknown as NextRequest;
  return GET(req, { params: Promise.resolve({ certificateNo: no }) });
}

beforeEach(() => {
  db.sb = fakeSupabase({ valuation_certificates: [row()] });
});

describe("GET /api/verify/valuation/[certificateNo]", () => {
  it("valid: on record, hash matches, not revoked — and no financial figures", async () => {
    const res = await call(SAMPLE.certificateNo);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      found: true,
      status: "valid",
      certificateNo: SAMPLE.certificateNo,
      startupName: SAMPLE.startupName,
      issuedAt: SAMPLE.issuedAt,
      contentHash: HASH,
      storedHashMatch: true,
      suppliedHashMatch: null,
      revoked: false,
      version: "vc-1",
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("2400000");
    expect(text).not.toContain("lowAud");
    expect(text).not.toContain("sviScore");
    expect(db.sb!.hasEq("valuation_certificates", "certificate_no", SAMPLE.certificateNo)).toBe(true);
  });

  it("tolerates lower case and a missing VC- prefix", async () => {
    const res = await call(SAMPLE.certificateNo.slice(3).toLowerCase());
    expect(res.status).toBe(200);
    expect((await res.json()).certificateNo).toBe(SAMPLE.certificateNo);
  });

  it("revoked → status revoked with the date and reason", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ revoked_at: "2026-10-01T00:00:00Z", revoked_reason: "re-scored" })] });
    const body = await (await call(SAMPLE.certificateNo)).json();
    expect(body.status).toBe("revoked");
    expect(body.revoked).toBe(true);
    expect(body.revokedAt).toBe("2026-10-01T00:00:00Z");
    expect(body.revokedReason).toBe("re-scored");
  });

  it("a payload that no longer hashes to the record → hash_mismatch", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ payload: { ...SAMPLE, sviScore: 999 } })] });
    const body = await (await call(SAMPLE.certificateNo)).json();
    expect(body.status).toBe("hash_mismatch");
    expect(body.storedHashMatch).toBe(false);
  });

  it("?hash= is compared against the stored hash", async () => {
    expect((await (await call(SAMPLE.certificateNo, `?hash=${HASH}`)).json()).suppliedHashMatch).toBe(true);
    expect((await (await call(SAMPLE.certificateNo, `?hash=blockid:v1:${"f".repeat(64)}`)).json()).suppliedHashMatch).toBe(false);
  });

  it("unknown number → 404; malformed → 404 without a lookup", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [] });
    const res = await call("VC-ZZZZZ-ZZZZZ");
    expect(res.status).toBe(404);
    expect((await res.json()).found).toBe(false);
    db.sb = fakeSupabase({ valuation_certificates: [row()] });
    expect((await call("../etc/passwd")).status).toBe(404);
    expect(db.sb!.calls.length).toBe(0);
  });
});
