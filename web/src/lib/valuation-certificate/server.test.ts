// Colocated suite for the certificate server module (S22-A): subject
// loading against a fake register, evidence summary, dimension mapping,
// number collision retry on issue, revoke guards and the list projection.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/connected-revenue", () => ({
  loadConnectedRevenueSignals: async () => [{ provider: "stripe", mrrAud: 8_200, capturedAt: new Date().toISOString() }],
}));

import {
  certificateSummary,
  dimensionsFromAnalysis,
  getCertificateForProject,
  issueCertificate,
  listCertificates,
  loadCertificateSubject,
  loadEssFacts,
  revokeCertificate,
  summariseEvidence,
} from "./server";
import { certificateHashMatches } from "./hash";
import { SAMPLE_CERTIFICATE, SAMPLE_CERTIFICATE_ESS } from "./fixtures";

const ANALYSIS = {
  version: "v3.6.8",
  totalSVI: 138,
  stage: 3,
  stageLabel: "Seed",
  sector: "saas",
  signals: { marketSize: "medium" },
  subs: [
    { key: "FTV", value: 72 },
    { key: "mpc", value: 64 },
    { key: "tre", value: 141 },
  ],
  dimensionScores: { ptd: 58 },
};

function subjectInput(db: ReturnType<typeof fakeSupabase>, over: Partial<Parameters<typeof loadCertificateSubject>[0]> = {}) {
  return {
    db,
    projectId: "proj-1",
    projectName: "Acme",
    dataEmail: "owner@x.test",
    ownerUserId: "user-owner",
    accountId: "acct-1",
    ...over,
  };
}

describe("dimensionsFromAnalysis", () => {
  it("maps subs (any case) + dimensionScores into the 8 canonical rows, clamped 0–100", () => {
    const dims = dimensionsFromAnalysis(ANALYSIS as never);
    expect(dims.map((d) => d.key)).toEqual(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]);
    expect(dims.find((d) => d.key === "ftv")?.score).toBe(72);
    expect(dims.find((d) => d.key === "ptd")?.score).toBe(58);
    expect(dims.find((d) => d.key === "tre")?.score).toBe(100);
    expect(dims.find((d) => d.key === "svm")?.score).toBe(0);
    expect(dims.reduce((s, d) => s + d.weightPct, 0)).toBe(100);
    expect(dimensionsFromAnalysis(null).length).toBe(8);
  });
});

describe("summariseEvidence", () => {
  it("counts by category / dimension and finds the newest verified_at", () => {
    const s = summariseEvidence([
      { evidence_type: "document_uploaded", dimension: "tre", verified_at: "2026-09-01T00:00:00Z" },
      { evidence_type: "document_uploaded", dimension: "TRE", verified_at: "2026-09-10T00:00:00Z" },
      { evidence_type: "public_url", dimension: "mpc", verified_at: null },
      { evidence_type: null, dimension: "nope", verified_at: null },
    ]);
    expect(s.total).toBe(4);
    expect(s.verified).toBe(2);
    expect(s.lastVerifiedAt).toBe("2026-09-10T00:00:00Z");
    expect(s.byCategory).toEqual([
      { category: "document_uploaded", count: 2 },
      { category: "other", count: 1 },
      { category: "public_url", count: 1 },
    ]);
    expect(s.byDimension).toEqual([
      { dimension: "mpc", count: 1 },
      { dimension: "tre", count: 2 },
    ]);
    expect(summariseEvidence([])).toEqual({ total: 0, verified: 0, byCategory: [], byDimension: [], lastVerifiedAt: null });
  });
});

describe("loadCertificateSubject", () => {
  it("builds the subject from the project-scoped analysis, bridges connected revenue, links a matching score snapshot", async () => {
    const db = fakeSupabase({
      svi_analyses: [{ id: "an-1", analysis_json: ANALYSIS, total_svi: 138, raw_input: "saas" }],
      startup_score_history: [{ id: "sh-1", startup_name: "acme", inputs: { abn: "79 659 615 111" }, svi_analysis: null, total_score: 130, score_version: "v3" }],
      startup_metrics: [{ mrr_aud: 8_200, revenue_growth_pct: 8 }],
      svi_snapshots: [{ dimension_scores: {}, input_text: "saas" }],
      svi_accounts: [{ id: "acct-1", current_svi: 138, current_stage: 3 }],
      svi_evidence: [{ evidence_type: "document_uploaded", dimension: "tre", verified_at: "2026-09-10T00:00:00Z" }],
    });
    const res = await loadCertificateSubject(subjectInput(db));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const s = res.subject;
    expect(s.startupName).toBe("Acme");
    expect(s.abn).toBe("79 659 615 111");
    expect(s.stageLabel).toBe("Seed");
    expect(s.sviScore).toBe(138);
    expect(s.sviVersion).toBe("v3.6.8");
    expect(s.scoreHistoryId).toBe("sh-1");
    expect(s.valuation.lowAud).toBeGreaterThan(0);
    expect(s.valuation.midAud).toBeGreaterThanOrEqual(s.valuation.lowAud);
    expect(s.valuation.highAud).toBeGreaterThanOrEqual(s.valuation.midAud);
    expect(s.valuation.method).toBe("svi+arr_multiple");
    expect(s.connectedRevenue?.provider).toBe("stripe");
    expect(s.connectedRevenue?.arrAud).toBe(98_400);
    expect(s.sectorMultiple).toEqual({ sector: "saas", low: 6, mid: 6.75, high: 7.5, source: "Bessemer Venture Partners" });
    expect(s.dimensions.length).toBe(8);
    expect(s.evidence.total).toBe(1);
    // Data keys: owner's email + project for the analysis, owner's user id for history.
    expect(db.hasEq("svi_analyses", "email", "owner@x.test")).toBe(true);
    expect(db.hasEq("svi_analyses", "project_id", "proj-1")).toBe(true);
    expect(db.hasEq("startup_score_history", "user_id", "user-owner")).toBe(true);
    expect(db.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
  });

  it("does not link a score snapshot for a different startup and leaves ABN null", async () => {
    const db = fakeSupabase({
      svi_analyses: [{ id: "an-1", analysis_json: ANALYSIS, total_svi: 138 }],
      startup_score_history: [{ id: "sh-other", startup_name: "Other Co", inputs: { abn: "79 659 615 111" } }],
      svi_accounts: [{ id: "acct-1", current_svi: 138, current_stage: 3 }],
    });
    const res = await loadCertificateSubject(subjectInput(db));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.subject.scoreHistoryId).toBeNull();
    expect(res.subject.abn).toBeNull();
  });

  it("falls back to the score-history analysis when there is no svi_analyses row; no account → default sector", async () => {
    const db = fakeSupabase({
      svi_analyses: [],
      startup_score_history: [{ id: "sh-1", startup_name: "Acme", inputs: {}, svi_analysis: ANALYSIS, total_score: 130, score_version: "v3" }],
    });
    const res = await loadCertificateSubject(subjectInput(db, { accountId: null }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.subject.sviScore).toBe(138);
    expect(res.subject.dimensions.find((d) => d.key === "ftv")?.score).toBe(72);
    expect(res.subject.evidence.total).toBe(0);
    expect(res.subject.valuation.method).toBe("svi");
  });

  it("no analysis and no snapshot → no_svi_analysis", async () => {
    const db = fakeSupabase({ svi_analyses: [], startup_score_history: [] });
    expect(await loadCertificateSubject(subjectInput(db))).toEqual({ ok: false, error: "no_svi_analysis" });
  });
});

describe("ESS annex (S27-A)", () => {
  it("loadEssFacts reads the project's grant profile and the OWNER's cap table for the project; nothing on file → nulls", async () => {
    const db = fakeSupabase({
      project_grant_profiles: [{ project_id: "proj-1", incorporated_at: "2022-03-15", listed: false, turnover_aud: "420000.00", entity_type: "pty_ltd", prior_raise_aud: null }],
      shareholders: [
        { shares_held: 6_000_000, project_id: "proj-1", account_id: "user-owner" },
        { shares_held: "4000000", project_id: null, account_id: "user-owner" },
        { shares_held: 999, project_id: "proj-2", account_id: "user-owner" },
        { shares_held: 999, project_id: "proj-1", account_id: "someone-else" },
      ],
      esop_pool: [{ total_pool_shares: 1_000_000, project_id: "proj-1", account_id: "user-owner" }],
    });
    const facts = await loadEssFacts(db, { projectId: "proj-1", ownerUserId: "user-owner" });
    expect(facts).toEqual({ incorporatedAt: "2022-03-15", yearsSinceIncorporation: null, listed: false, turnoverAud: 420_000, entityType: "pty_ltd", priorRaiseAud: null, issuedShares: 10_000_000, esopPoolShares: 1_000_000 });
    expect(db.hasEq("project_grant_profiles", "project_id", "proj-1")).toBe(true);
    expect(db.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
    expect(db.hasEq("esop_pool", "account_id", "user-owner")).toBe(true);

    const empty = await loadEssFacts(fakeSupabase({}), { projectId: "proj-1", ownerUserId: "user-owner" });
    expect(empty).toEqual({ incorporatedAt: null, yearsSinceIncorporation: null, listed: null, turnoverAud: null, entityType: null, priorRaiseAud: null, issuedShares: null, esopPoolShares: null });
    // Another project's profile row is never used (the fake ignores filters — the code re-checks).
    const other = await loadEssFacts(fakeSupabase({ project_grant_profiles: [{ project_id: "proj-9", incorporated_at: "2020-01-01", listed: true }] }), { projectId: "proj-1", ownerUserId: "user-owner" });
    expect(other.incorporatedAt).toBeNull();
    expect(other.listed).toBeNull();
  });

  it("loadCertificateSubject freezes the annex only when asked; the checklist comes from the facts on file", async () => {
    const rows = {
      svi_analyses: [{ id: "an-1", analysis_json: ANALYSIS, total_svi: 138, raw_input: "saas" }],
      startup_score_history: [],
      startup_metrics: [],
      svi_snapshots: [],
      svi_accounts: [{ id: "acct-1", current_svi: 138, current_stage: 3 }],
      svi_evidence: [],
      project_grant_profiles: [{ project_id: "proj-1", incorporated_at: "2022-03-15", listed: false, turnover_aud: 420_000, entity_type: "pty_ltd" }],
      shareholders: [{ shares_held: 10_000_000, project_id: "proj-1", account_id: "user-owner" }],
      esop_pool: [],
    };
    const without = await loadCertificateSubject(subjectInput(fakeSupabase(rows)));
    expect(without.ok && without.subject.ess).toBeUndefined();
    const withEss = await loadCertificateSubject(subjectInput(fakeSupabase(rows), { annexes: { ess: true }, now: new Date("2026-09-12T00:00:00Z") }));
    expect(withEss.ok).toBe(true);
    if (!withEss.ok) return;
    const ess = withEss.subject.ess!;
    expect(ess.version).toBe("ess-1");
    expect(ess.facts.issuedShares).toBe(10_000_000);
    expect(ess.checklist.filter((r) => r.status === "met").map((r) => r.key)).toEqual(["unlisted", "age", "turnover"]);
    expect(ess.indicativePerShare?.basisShares).toBe(10_000_000);
  });

  it("issueCertificate re-stamps the annex at the issue date and the hash covers it", async () => {
    const rest: Record<string, unknown> = { ...SAMPLE_CERTIFICATE_ESS };
    for (const k of ["version", "certificateNo", "issuedAt", "verifyUrl"]) delete rest[k];
    const db = fakeSupabase({ valuation_certificates: [] });
    const res = await issueCertificate({ db, projectId: "proj-1", userId: "u-1", subject: rest as never, creditsCharged: 0, baseUrl: "https://blockid.au", now: new Date("2032-04-01T00:00:00Z") });
    expect(res.ok).toBe(true);
    const ins = db.find("valuation_certificates", "insert")[0].args[0] as Record<string, unknown>;
    const payload = ins.payload as typeof SAMPLE_CERTIFICATE_ESS;
    expect(payload.ess?.facts.yearsSinceIncorporation).toBe(10); // 2022-03-15 → 2032-04-01
    expect(payload.ess?.checklist.find((r) => r.key === "age")?.status).toBe("not_confirmed");
    expect(certificateHashMatches(payload, ins.content_hash as string)).toBe(true);
    // Tampering with the frozen annex breaks the hash like any other field.
    const tampered = { ...payload, ess: { ...payload.ess!, checklist: payload.ess!.checklist.map((r) => ({ ...r, status: "met" as const })) } };
    expect(certificateHashMatches(tampered, ins.content_hash as string)).toBe(false);
    const row = { id: "c-1", project_id: "proj-1", user_id: "u-1", score_history_id: null, certificate_no: payload.certificateNo, content_hash: ins.content_hash as string, payload, startup_name: "Acme", svi_score: 138, credits_charged: 0, issued_at: payload.issuedAt, revoked_at: null, revoked_reason: null };
    expect(certificateSummary(row).annexes).toEqual({ ess: true });
    expect(certificateSummary({ ...row, payload: SAMPLE_CERTIFICATE }).annexes).toEqual({ ess: false });
  });
});

describe("issueCertificate", () => {
  const subject = (() => {
    const rest: Record<string, unknown> = { ...SAMPLE_CERTIFICATE };
    for (const k of ["version", "certificateNo", "issuedAt", "verifyUrl"]) delete rest[k];
    return rest as Parameters<typeof issueCertificate>[0]["subject"];
  })();

  it("freezes a payload whose hash matches the stored content_hash and whose verify URL uses the base", async () => {
    const db = fakeSupabase({ valuation_certificates: [] });
    const res = await issueCertificate({ db, projectId: "proj-1", userId: "u-1", subject, creditsCharged: 5, baseUrl: "https://blockid.au/" , now: new Date("2026-09-12T00:00:00Z") });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ins = db.find("valuation_certificates", "insert")[0].args[0] as Record<string, unknown>;
    const payload = ins.payload as typeof SAMPLE_CERTIFICATE;
    expect(payload.certificateNo).toBe(ins.certificate_no);
    expect(payload.issuedAt).toBe("2026-09-12T00:00:00.000Z");
    expect(payload.verifyUrl).toBe(`https://blockid.au/verify/valuation/${ins.certificate_no}`);
    expect(certificateHashMatches(payload, ins.content_hash as string)).toBe(true);
    expect(ins.credits_charged).toBe(5);
    expect(ins.score_history_id).toBeNull();
  });

  it("retries with a new number on a unique-key collision and gives up after three", async () => {
    let attempts = 0;
    const seen: string[] = [];
    const collide = (times: number) => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              attempts++;
              seen.push(String(row.certificate_no));
              if (attempts <= times) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
              return { data: { ...row, id: "c-1" }, error: null };
            },
          }),
        }),
      }),
    });
    attempts = 0;
    const ok = await issueCertificate({ db: collide(1), projectId: "p", userId: "u", subject, creditsCharged: 0 });
    expect(ok.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(new Set(seen).size).toBe(2);

    attempts = 0;
    const fail = await issueCertificate({ db: collide(99), projectId: "p", userId: "u", subject, creditsCharged: 0 });
    expect(fail).toEqual({ ok: false, error: "insert_failed" });
    expect(attempts).toBe(3);
  });

  it("a non-collision insert error fails immediately", async () => {
    const db = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }) }) }) }),
    };
    expect(await issueCertificate({ db, projectId: "p", userId: "u", subject, creditsCharged: 0 })).toEqual({ ok: false, error: "insert_failed" });
  });
});

describe("register reads + revoke", () => {
  const ROW = {
    id: "c-1",
    project_id: "proj-1",
    user_id: "u-1",
    score_history_id: null,
    certificate_no: "VC-AAAAA-BBBBB",
    content_hash: "blockid:v1:" + "0".repeat(64),
    payload: SAMPLE_CERTIFICATE,
    startup_name: "Acme",
    svi_score: 138,
    credits_charged: "5.00",
    issued_at: "2026-09-12T00:00:00Z",
    revoked_at: null,
    revoked_reason: null,
  };

  let db: ReturnType<typeof fakeSupabase>;
  beforeEach(() => {
    db = fakeSupabase({ valuation_certificates: [ROW] });
  });

  it("getCertificateForProject pins both id and project", async () => {
    expect(await getCertificateForProject(db, "c-1", "proj-1")).toMatchObject({ id: "c-1" });
    expect(await getCertificateForProject(db, "c-2", "proj-1")).toBeNull();
    expect(await getCertificateForProject(db, "c-1", "proj-2")).toBeNull();
  });

  it("listCertificates filters by project and projects a summary", async () => {
    const rows = await listCertificates(db, "proj-1");
    expect(rows.length).toBe(1);
    expect(db.hasEq("valuation_certificates", "project_id", "proj-1")).toBe(true);
    const s = certificateSummary(rows[0], "https://blockid.au");
    expect(s).toMatchObject({
      id: "c-1",
      certificateNo: "VC-AAAAA-BBBBB",
      startupName: "Acme",
      sviScore: 138,
      method: "svi+arr_multiple",
      creditsCharged: 5,
      verifyUrl: "https://blockid.au/verify/valuation/VC-AAAAA-BBBBB",
      pdfUrl: "/api/valuation/certificate/c-1/pdf",
      revokedAt: null,
    });
    expect(s.valuation?.midAud).toBe(2_400_000);
  });

  it("revokeCertificate: not_found for another project, already_revoked second time", async () => {
    expect(await revokeCertificate(db, "c-1", "proj-2", "x")).toEqual({ ok: false, error: "not_found" });
    const ok = await revokeCertificate(db, "c-1", "proj-1", "re-scored", new Date("2026-10-01T00:00:00Z"));
    expect(ok.ok).toBe(true);
    const patch = db.find("valuation_certificates", "update")[0].args[0] as Record<string, unknown>;
    expect(patch).toEqual({ revoked_at: "2026-10-01T00:00:00.000Z", revoked_reason: "re-scored" });
    const db2 = fakeSupabase({ valuation_certificates: [{ ...ROW, revoked_at: "2026-10-01T00:00:00Z", revoked_reason: "x" }] });
    expect(await revokeCertificate(db2, "c-1", "proj-1", "again")).toEqual({ ok: false, error: "already_revoked" });
  });
});
