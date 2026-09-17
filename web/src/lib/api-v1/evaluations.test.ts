// G14-S38 — the public row shape (internals never leave), the keyset
// cursor, the query parser bounds (limit ≤ 100) and the three filters.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/evaluations", () => ({ listEvaluations: vi.fn(async () => []) }));
vi.mock("@/lib/evaluations/dossier", () => ({ DOSSIER_PATH: (id: string) => `/workspace/evaluations/${id}` }));

import type { EvaluationListRow } from "@/lib/evaluations";
import { decodeCursor, encodeCursor, pageEvaluations, parseListQuery, toPublicEvaluation, V1_MAX_LIMIT } from "./evaluations";

function row(over: Partial<EvaluationListRow> = {}): EvaluationListRow {
  return {
    id: "ev-1",
    evaluatorUserId: "u-eval",
    projectId: "p-1",
    ownerKind: "evaluator",
    consentTier: "attributed_only",
    founderEmail: "founder@example.com",
    founderUserId: "u-founder",
    inviteToken: "tok_secret",
    invitedAt: null,
    claimedAt: null,
    label: "Series A watch",
    notes: "private thoughts",
    website: "https://acme.example",
    state: "NSW",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
    projectName: "Acme",
    projectSlug: "acme",
    projectIndustry: "Fintech",
    projectStage: 3,
    projectDescription: "Payments for tradies",
    latestSvi: 61,
    latestSviAt: "2026-09-09T00:00:00.000Z",
    ...over,
  };
}

describe("toPublicEvaluation", () => {
  it("projects the workspace row to the public shape and drops invite token, founder e-mail / id and private notes", () => {
    const pub = toPublicEvaluation(row(), { score: 72, computed_at: "2026-09-10T00:00:00.000Z" });
    expect(pub).toMatchObject({
      id: "ev-1",
      project: { id: "p-1", slug: "acme", name: "Acme", industry: "Fintech", stage: 3, website: "https://acme.example", state: "NSW" },
      owner_kind: "evaluator",
      consent_tier: "attributed_only",
      founder_claimed: false,
      label: "Series A watch",
      svi: { total: 61, at: "2026-09-09T00:00:00.000Z" },
      fit: { score: 72, computed_at: "2026-09-10T00:00:00.000Z" },
      links: { dossier: "/api/v1/evaluations/ev-1/dossier", assessment: "/api/v1/evaluations/ev-1/assessment", workspace: "/workspace/evaluations/ev-1" },
    });
    const json = JSON.stringify(pub);
    for (const forbidden of ["tok_secret", "founder@example.com", "u-founder", "private thoughts", "u-eval"]) expect(json).not.toContain(forbidden);
    expect(toPublicEvaluation(row({ ownerKind: "founder_claimed", claimedAt: "2026-09-12T00:00:00.000Z" })).founder_claimed).toBe(true);
  });
});

describe("cursor", () => {
  it("round-trips (created_at, id) and rejects garbage", () => {
    const c = encodeCursor({ createdAt: "2026-09-10T00:00:00.000Z", id: "ev-1" });
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c)).toEqual({ createdAt: "2026-09-10T00:00:00.000Z", id: "ev-1" });
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("!!!")).toBeNull();
    expect(decodeCursor(Buffer.from("no-separator").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("not-a-date|id").toString("base64url"))).toBeNull();
  });
});

describe("parseListQuery", () => {
  it("defaults, bounds and errors", () => {
    expect(parseListQuery(new URLSearchParams())).toEqual({ ok: true, query: { limit: 25, cursor: null, industry: null, stage: null, min_fit: null } });
    expect(parseListQuery(new URLSearchParams({ limit: "100" }))).toMatchObject({ ok: true, query: { limit: V1_MAX_LIMIT } });
    expect(parseListQuery(new URLSearchParams({ limit: "101" }))).toMatchObject({ ok: false });
    expect(parseListQuery(new URLSearchParams({ limit: "0" }))).toMatchObject({ ok: false });
    expect(parseListQuery(new URLSearchParams({ cursor: "***" }))).toMatchObject({ ok: false });
    expect(parseListQuery(new URLSearchParams({ stage: "13" }))).toMatchObject({ ok: false });
    expect(parseListQuery(new URLSearchParams({ min_fit: "101" }))).toMatchObject({ ok: false });
    expect(parseListQuery(new URLSearchParams({ industry: " Fintech ", stage: "3", min_fit: "40" }))).toEqual({
      ok: true,
      query: { limit: 25, cursor: null, industry: "Fintech", stage: 3, min_fit: 40 },
    });
  });
});

describe("pageEvaluations", () => {
  const rows = [
    row({ id: "a", createdAt: "2026-09-01T00:00:00.000Z", projectId: "p-a", projectIndustry: "Fintech", projectStage: 2 }),
    row({ id: "b", createdAt: "2026-09-02T00:00:00.000Z", projectId: "p-b", projectIndustry: "Healthtech", projectStage: 3 }),
    row({ id: "c", createdAt: "2026-09-03T00:00:00.000Z", projectId: "p-c", projectIndustry: "fintech", projectStage: 3 }),
  ];
  const q = { limit: 25, cursor: null, industry: null, stage: null, min_fit: null };

  it("newest first, page + next_cursor + has_more, cursor continues after the last row", () => {
    const first = pageEvaluations(rows, { ...q, limit: 2 }, null);
    expect(first.data.map((r) => r.id)).toEqual(["c", "b"]);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBeTruthy();
    const second = pageEvaluations(rows, { ...q, limit: 2, cursor: first.next_cursor }, null);
    expect(second.data.map((r) => r.id)).toEqual(["a"]);
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeNull();
  });

  it("industry is case-insensitive, stage is exact, min_fit needs a primary-mandate fit row", () => {
    expect(pageEvaluations(rows, { ...q, industry: "FINTECH" }, null).data.map((r) => r.id)).toEqual(["c", "a"]);
    expect(pageEvaluations(rows, { ...q, stage: 3 }, null).data.map((r) => r.id)).toEqual(["c", "b"]);
    const fit = new Map([
      ["p-a", { score: 80, computed_at: null }],
      ["p-b", { score: 30, computed_at: null }],
    ]);
    const page = pageEvaluations(rows, { ...q, min_fit: 40 }, fit);
    expect(page.data.map((r) => r.id)).toEqual(["a"]);
    expect(page.data[0].fit).toEqual({ score: 80, computed_at: null });
    expect(pageEvaluations(rows, { ...q, min_fit: 40 }, null).data).toEqual([]);
  });
});
