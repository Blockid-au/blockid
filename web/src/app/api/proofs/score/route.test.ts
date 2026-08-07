// Unit tests for POST + GET /api/proofs/score — the tamper-evident proof
// anchoring endpoint for SVI / legacy score rows. Covers route wiring only:
// canonicalizeScore + hashScore + getSupabaseAdmin are mocked so the branch
// matrix in route.ts is asserted without a real Supabase or hasher.
//
// Route contract branches asserted:
//   POST
//     1.  503 when getSupabaseAdmin() returns null (nothing else is invoked).
//     2.  400 on unparseable JSON body (request.json() throws).
//     3.  400 when score_id is missing / not a string / empty.
//     4.  404 when neither svi_analyses nor scores has a row for score_id
//         (both lookups fire in order, second only after first misses).
//     5.  scores-fallback source: when svi_analyses has no row, scores is
//         queried and its columns feed the canonicalize payload +
//         trust_events metadata.
//     6.  Happy path svi_analyses source: canonicalizeScore receives the
//         source-tagged payload; hashScore receives the canonical string;
//         score_proofs is inserted with { score_id, hash, canonical_json,
//         anchor_method: 'local', verified: true }; trust_events row is
//         inserted with { entity_type: 'score', entity_id, event_type:
//         'created', hash, metadata:{ proof_id, company_name, score_date,
//         svi_total, anchor_method:'local' } }; response returns
//         { ok, proofId, hash, anchoredAt, idempotent:false }.
//     7.  Idempotency: when score_proofs already has a row for the computed
//         hash, the existing row is returned with idempotent:true and NO
//         insert into score_proofs / trust_events fires.
//     8.  500 when the score_proofs insert fails — trust_events is skipped.
//     9.  score_id is trimmed before use (leading/trailing whitespace in
//         the request body must not break the lookup or corrupt the
//         trust_events entity_id).
//     10. scores-source trust_events metadata: company_name comes from the
//         legacy row's company_name column and svi_total from total_score
//         (not analysis_json.companyName / total_svi).
//   GET
//     11. 503 when getSupabaseAdmin() returns null.
//     12. 400 when proof_id query param is missing.
//     13. 404 when the proof lookup returns no row (or errors).
//     14. 200 returns { ok:true, proof } with the full row shape.
//
// The fake Supabase client only implements the exact chain shapes route.ts
// uses; each per-table handler is injected via `state.tables` so a test can
// pin a specific row-set or error mode without touching sibling tables.

import { beforeEach, describe, expect, it, vi } from "vitest";

type MaybeSingleResult = { data: unknown; error: unknown };

type TableState = {
  select?: (cols: string) => {
    eq: (col: string, val: string) => {
      maybeSingle: () => Promise<MaybeSingleResult>;
    };
  };
  insertReturning?: (row: Record<string, unknown>) => {
    select: (cols: string) => {
      single: () => Promise<MaybeSingleResult>;
    };
  };
  insertFireAndForget?: (row: Record<string, unknown>) => Promise<unknown>;
};

const state: {
  supabase: unknown;
  tables: Record<string, TableState>;
  lastInserts: Record<string, Record<string, unknown>>;
} = { supabase: null, tables: {}, lastInserts: {} };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => state.supabase,
}));

const canonicalizeMock = vi.fn<(v: unknown) => string>();
vi.mock("@/lib/proofs/canonical-json", () => ({
  canonicalizeScore: (v: unknown) => canonicalizeMock(v),
}));

const hashMock = vi.fn<(s: string) => string>();
vi.mock("@/lib/proofs/hash", () => ({
  hashScore: (s: string) => hashMock(s),
}));

import { POST, GET } from "./route";

function makeSupabase() {
  return {
    from(table: string) {
      const t = state.tables[table] ?? {};
      return {
        select(cols: string) {
          return t.select
            ? t.select(cols)
            : {
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              };
        },
        insert(row: Record<string, unknown>) {
          state.lastInserts[table] = row;
          if (t.insertReturning) return t.insertReturning(row);
          if (t.insertFireAndForget) return t.insertFireAndForget(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

function scoreLookupHit(row: Record<string, unknown>): TableState {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: row, error: null }),
      }),
    }),
  };
}

function scoreLookupMiss(): TableState {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  };
}

function proofsInsert(returned: Record<string, unknown> | null, error: unknown = null): TableState {
  return {
    insertReturning: () => ({
      select: () => ({
        single: async () => ({ data: returned, error }),
      }),
    }),
  };
}

function proofsIdempotentHit(row: Record<string, unknown>): TableState {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: row, error: null }),
      }),
    }),
    insertReturning: proofsInsert({}).insertReturning,
  };
}

const trustEventsCapture: TableState = {
  insertFireAndForget: async () => ({ data: null, error: null }),
};

function req(body: unknown, opts: { rawText?: string } = {}) {
  return new Request("http://localhost/api/proofs/score", {
    method: "POST",
    body: opts.rawText ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const SVI_ROW = {
  id: "svi-123",
  email: "founder@x.co",
  total_svi: 812,
  analysis_json: { companyName: "Acme Pty Ltd" },
  created_at: "2026-07-01T00:00:00.000Z",
};

const LEGACY_ROW = {
  id: "legacy-456",
  email: "old@x.co",
  company_name: "Legacy Inc",
  total_score: 640,
  sub_scores: { team: 80 },
  inputs: { raised: 100 },
  score_version: "v1",
  created_at: "2025-01-01T00:00:00.000Z",
};

const INSERTED_PROOF = {
  id: "proof-1",
  hash: "blockid:v1:deadbeef",
  anchored_at: "2026-07-30T12:00:00.000Z",
};

beforeEach(() => {
  state.tables = {};
  state.lastInserts = {};
  state.supabase = makeSupabase();
  canonicalizeMock.mockReset();
  hashMock.mockReset();
  canonicalizeMock.mockReturnValue('{"canonical":true}');
  hashMock.mockReturnValue("blockid:v1:deadbeef");
});

describe("POST /api/proofs/score", () => {
  it("503s when Supabase is not configured", async () => {
    state.supabase = null;
    const res = await POST(req({ score_id: "svi-123" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Supabase/i);
    expect(canonicalizeMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it("400s on unparseable JSON body", async () => {
    const res = await POST(req(null, { rawText: "{not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
    expect(canonicalizeMock).not.toHaveBeenCalled();
  });

  it("400s when score_id is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("score_id is required");
  });

  it("400s when score_id is not a string", async () => {
    const res = await POST(req({ score_id: 42 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("score_id is required");
  });

  it("400s when score_id is empty string", async () => {
    const res = await POST(req({ score_id: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("score_id is required");
  });

  it("404s when neither svi_analyses nor scores has a row for score_id", async () => {
    state.tables.svi_analyses = scoreLookupMiss();
    state.tables.scores = scoreLookupMiss();
    const res = await POST(req({ score_id: "missing" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Score not found");
    expect(canonicalizeMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
  });

  it("happy-path svi_analyses source: canonicalize→hash→insert proof→insert trust event→return non-idempotent envelope", async () => {
    state.tables.svi_analyses = scoreLookupHit(SVI_ROW);
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          single: async () => ({ data: INSERTED_PROOF, error: null }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    const res = await POST(req({ score_id: "svi-123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      proofId: "proof-1",
      hash: "blockid:v1:deadbeef",
      anchoredAt: "2026-07-30T12:00:00.000Z",
      idempotent: false,
    });

    // Canonicalize receives the source-tagged payload.
    expect(canonicalizeMock).toHaveBeenCalledTimes(1);
    expect(canonicalizeMock.mock.calls[0][0]).toEqual({
      source: "svi_analyses",
      id: SVI_ROW.id,
      email: SVI_ROW.email,
      total_svi: SVI_ROW.total_svi,
      analysis_json: SVI_ROW.analysis_json,
      created_at: SVI_ROW.created_at,
    });

    // Hash receives the canonical string.
    expect(hashMock).toHaveBeenCalledWith('{"canonical":true}');

    // score_proofs insert row shape.
    expect(state.lastInserts.score_proofs).toEqual({
      score_id: "svi-123",
      hash: "blockid:v1:deadbeef",
      canonical_json: '{"canonical":true}',
      anchor_method: "local",
      verified: true,
    });

    // trust_events insert row shape + metadata pulled from the SVI row.
    expect(state.lastInserts.trust_events).toEqual({
      entity_type: "score",
      entity_id: "svi-123",
      event_type: "created",
      hash: "blockid:v1:deadbeef",
      metadata: {
        proof_id: "proof-1",
        company_name: "Acme Pty Ltd",
        score_date: SVI_ROW.created_at,
        svi_total: 812,
        anchor_method: "local",
      },
    });
  });

  it("falls back to the scores table when svi_analyses has no row and pulls metadata from company_name/total_score", async () => {
    state.tables.svi_analyses = scoreLookupMiss();
    state.tables.scores = scoreLookupHit(LEGACY_ROW);
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          single: async () => ({ data: INSERTED_PROOF, error: null }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    const res = await POST(req({ score_id: "legacy-456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Canonicalize receives the legacy-shaped payload with source tag.
    expect(canonicalizeMock.mock.calls[0][0]).toEqual({
      source: "scores",
      id: LEGACY_ROW.id,
      email: LEGACY_ROW.email,
      company_name: LEGACY_ROW.company_name,
      total_score: LEGACY_ROW.total_score,
      sub_scores: LEGACY_ROW.sub_scores,
      inputs: LEGACY_ROW.inputs,
      score_version: LEGACY_ROW.score_version,
      created_at: LEGACY_ROW.created_at,
    });

    // trust_events metadata reflects legacy columns.
    expect(state.lastInserts.trust_events.metadata).toEqual({
      proof_id: "proof-1",
      company_name: "Legacy Inc",
      score_date: LEGACY_ROW.created_at,
      svi_total: 640,
      anchor_method: "local",
    });
  });

  it("returns the existing proof (idempotent:true) when the hash already exists — no new insert, no trust_event", async () => {
    state.tables.svi_analyses = scoreLookupHit(SVI_ROW);
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "existing-proof",
              hash: "blockid:v1:deadbeef",
              anchored_at: "2025-12-01T00:00:00.000Z",
            },
            error: null,
          }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          // If this ever fires the assertions below on lastInserts will fail.
          single: async () => ({ data: INSERTED_PROOF, error: null }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    const res = await POST(req({ score_id: "svi-123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      proofId: "existing-proof",
      hash: "blockid:v1:deadbeef",
      anchoredAt: "2025-12-01T00:00:00.000Z",
      idempotent: true,
    });

    // No new proof insert, no trust event.
    expect(state.lastInserts.score_proofs).toBeUndefined();
    expect(state.lastInserts.trust_events).toBeUndefined();
  });

  it("500s when the score_proofs insert fails — trust_events is NOT written", async () => {
    state.tables.svi_analyses = scoreLookupHit(SVI_ROW);
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: "constraint violation" } }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    const res = await POST(req({ score_id: "svi-123" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Failed to anchor proof");
    // The insert row was still built (we can see it in lastInserts.score_proofs)
    // but trust_events must never fire when the proof insert fails.
    expect(state.lastInserts.trust_events).toBeUndefined();
  });

  it("trims whitespace from score_id before the lookup and stamps the trimmed value into trust_events.entity_id", async () => {
    state.tables.svi_analyses = scoreLookupHit(SVI_ROW);
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          single: async () => ({ data: INSERTED_PROOF, error: null }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    await POST(req({ score_id: "  svi-123  " }));
    expect(state.lastInserts.score_proofs.score_id).toBe("svi-123");
    expect(state.lastInserts.trust_events.entity_id).toBe("svi-123");
  });

  it("svi source with null analysis_json falls back to null companyName in trust_events metadata", async () => {
    state.tables.svi_analyses = scoreLookupHit({
      ...SVI_ROW,
      analysis_json: null,
    });
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insertReturning: () => ({
        select: () => ({
          single: async () => ({ data: INSERTED_PROOF, error: null }),
        }),
      }),
    };
    state.tables.trust_events = trustEventsCapture;

    await POST(req({ score_id: "svi-123" }));
    const meta = (state.lastInserts.trust_events.metadata as Record<string, unknown>);
    expect(meta.company_name).toBeNull();
  });
});

function getReq(url: string) {
  return new Request(url, { method: "GET" });
}

describe("GET /api/proofs/score", () => {
  it("503s when Supabase is not configured", async () => {
    state.supabase = null;
    const res = await GET(getReq("http://localhost/api/proofs/score?proof_id=p1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Supabase/i);
  });

  it("400s when proof_id query param is missing", async () => {
    const res = await GET(getReq("http://localhost/api/proofs/score"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("proof_id query param is required");
  });

  it("404s when the proof lookup returns no row", async () => {
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
    const res = await GET(getReq("http://localhost/api/proofs/score?proof_id=nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proof not found");
  });

  it("404s when the proof lookup surfaces an error", async () => {
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "boom" } }),
        }),
      }),
    };
    const res = await GET(getReq("http://localhost/api/proofs/score?proof_id=whatever"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Proof not found");
  });

  it("200 returns { ok:true, proof } with the full row shape", async () => {
    const row = {
      id: "proof-xyz",
      score_id: "svi-abc",
      hash: "blockid:v1:cafebabe",
      canonical_json: '{"k":1}',
      anchor_method: "local",
      verified: true,
      anchored_at: "2026-07-30T12:00:00.000Z",
    };
    state.tables.score_proofs = {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    };
    const res = await GET(getReq("http://localhost/api/proofs/score?proof_id=proof-xyz"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, proof: row });
  });
});
