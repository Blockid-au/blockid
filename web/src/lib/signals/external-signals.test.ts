// Colocated tests for lib/signals/external-signals.ts (G14-S40): the
// register → evidence mapping (grant → IRI, R&DTI → TRE band, ABR → LCO),
// the S36 origin cap (connector → connected_source, never higher), the
// 42P01-guarded readers, and the register cohort maths.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { capConfidence } from "@/lib/evidence/confidence-cap";
import {
  aggregateRegisterEntities,
  bandRdSpend,
  buildRegisterCohort,
  cohortFromRegisters,
  externalSignalConfidence,
  loadProjectAbn,
  loadSignalsForAbn,
  mapSignalsToEvidence,
  percentileWithinCohort,
  registerMaturityScore,
  signalsForAbn,
  type ExternalSignalRow,
  type RegisterEntity,
} from "./external-signals";

const NOW = Date.parse("2026-09-17T00:00:00Z");
const ABN = "95608464535";

const abrRow: ExternalSignalRow = {
  source_id: "abr-bulk",
  entity_abn: ABN,
  entity_acn: "608464535",
  entity_name: "HARBOUR ANALYTICS PTY LTD",
  signal_type: "abr_entity",
  value: { abn_status: "ACT", abn_status_from: "2019-03-01", entity_type: "Australian Private Company", state: "NSW", gst_status: "ACT", gst_from: "2019-03-01" },
  as_of: "2025-06-14",
  fetched_at: "2026-09-10T00:00:00Z",
  source_url: "https://abr.business.gov.au/ABN/View?abn=95608464535",
  match_confidence: "high",
};
const grantRow: ExternalSignalRow = {
  source_id: "business-gov-grants",
  entity_abn: ABN,
  signal_type: "grant_award",
  value: { ga_id: "GA100001", agency: "Department of Industry Science and Resources", program: "Accelerating Commercialisation", amount_aud: 486500, approval_date: "2025-03-15" },
  as_of: "2025-03-15",
  source_url: "https://www.grants.gov.au/Ga/List?search=GA100001",
  match_confidence: "high",
};
const rdtiRow: ExternalSignalRow = {
  source_id: "rdti-transparency",
  entity_abn: ABN,
  signal_type: "rdti_registration",
  value: { company_name: "HARBOUR ANALYTICS PTY LTD", rd_expenditure_aud: 449266, amended_rd_expenditure_aud: null, income_year: "2022-23" },
  as_of: "2023-06-30",
  source_url: "https://data.gov.au/data/dataset/research-and-development-tax-incentive",
  match_confidence: "high",
};

describe("mapSignalsToEvidence", () => {
  it("grant → IRI(+CGH), R&DTI → TRE band, ABR → LCO; every row is source external, origin connector, confidence connected_source, with source_url + as_of", () => {
    const rows = mapSignalsToEvidence([rdtiRow, abrRow, grantRow], { now: NOW });
    expect(rows.map((r) => r.signal_type)).toEqual(["abr_entity", "grant_award", "rdti_registration"]); // newest as_of first
    const [lco, iri, tre] = rows;
    expect(lco.dims).toEqual(["lco"]);
    expect(lco.status).toBe("evidenced");
    expect(lco.value).toContain("ABN active since 2019-03-01");
    expect(lco.value).toContain("GST registered since 2019-03-01");
    expect(lco.value).toMatch(/entity age \d+ months/);
    expect(iri.dims).toEqual(["iri", "cgh"]);
    expect(iri.label).toBe("Grant award — Accelerating Commercialisation (Department of Industry Science and Resources)");
    expect(iri.value).toContain("$486,500");
    expect(iri.value).toContain("approved 2025-03-15");
    expect(tre.dims).toEqual(["tre"]);
    expect(tre.label).toBe("R&D Tax Incentive register — 2022-23");
    expect(tre.value).toContain("R&D expenditure band A$100k–500k");
    expect(tre.value).toContain("register: $449,266"); // the register's own figure, never a derived one
    for (const r of rows) {
      expect(r.source).toBe("external");
      expect(r.origin).toBe("connector");
      expect(r.confidence).toBe("connected_source");
      expect(r.source_url).toMatch(/^https:/);
      expect(r.as_of).toBe(r.observedAt);
      expect(r.evidence_id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(new Set(rows.map((r) => r.evidence_id)).size).toBe(3);
  });

  it("the S36 cap holds: a register row can never claim above connected_source, and matches capConfidence(connector)", () => {
    expect(externalSignalConfidence()).toBe(capConfidence({ requested: "connected_source", origin: "connector" }).level);
    expect(capConfidence({ requested: "third_party_verified", origin: "connector" }).level).not.toBe("third_party_verified");
  });

  it("cancelled ABN → partial; low match → partial; stale fetched_at → stale; unknown signal types are dropped; missing R&D figure → partial", () => {
    const cancelled = mapSignalsToEvidence([{ ...abrRow, value: { ...abrRow.value, abn_status: "CAN", gst_status: "CAN" } }], { now: NOW })[0];
    expect(cancelled.status).toBe("partial");
    expect(cancelled.value).toContain("ABN cancelled");
    expect(cancelled.value).toContain("GST cancelled");
    const low = mapSignalsToEvidence([{ ...grantRow, match_confidence: "low" }], { now: NOW })[0];
    expect(low.status).toBe("partial");
    expect(low.match_confidence).toBe("low");
    const stale = mapSignalsToEvidence([{ ...abrRow, fetched_at: "2024-01-01T00:00:00Z" }], { now: NOW })[0];
    expect(stale.status).toBe("stale");
    expect(mapSignalsToEvidence([{ ...abrRow, signal_type: "made_up" }], { now: NOW })).toEqual([]);
    const noFigure = mapSignalsToEvidence([{ ...rdtiRow, value: { income_year: "2022-23" } }], { now: NOW })[0];
    expect(noFigure.status).toBe("partial");
    expect(noFigure.value).toContain("expenditure not published");
  });

  it("bandRdSpend boundaries", () => {
    expect(bandRdSpend(99_999)).toBe("under_100k");
    expect(bandRdSpend(100_000)).toBe("100k_500k");
    expect(bandRdSpend(499_999)).toBe("100k_500k");
    expect(bandRdSpend(500_000)).toBe("500k_2m");
    expect(bandRdSpend(2_000_000)).toBe("2m_10m");
    expect(bandRdSpend(10_000_000)).toBe("over_10m");
  });
});

/** Chainable fake: every builder method returns the chain; awaiting resolves { data, error }. */
function fakeDb(result: { data?: unknown; error?: { code: string; message: string } }, calls: Array<{ table: string; args: unknown[] }> = []) {
  return {
    from(table: string) {
      const record = (name: string) => (...args: unknown[]) => {
        calls.push({ table, args: [name, ...args] });
        return chain;
      };
      const chain: Record<string, unknown> = {
        select: record("select"),
        eq: record("eq"),
        in: record("in"),
        not: record("not"),
        order: record("order"),
        limit: record("limit"),
        maybeSingle: () => Promise.resolve({ data: Array.isArray(result.data) ? result.data[0] ?? null : (result.data ?? null), error: result.error ?? null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(res),
      };
      return chain;
    },
  };
}

describe("readers (42P01-guarded)", () => {
  it("loadSignalsForAbn: invalid ABN / no db / missing table / thrown → []; valid → rows filtered by the normalised ABN", async () => {
    expect(await loadSignalsForAbn(null, ABN)).toEqual([]);
    expect(await loadSignalsForAbn(fakeDb({ data: [abrRow] }), "12345678901")).toEqual([]);
    expect(await loadSignalsForAbn(fakeDb({ error: { code: "42P01", message: "missing" } }), ABN)).toEqual([]);
    expect(await loadSignalsForAbn({ from: () => { throw new Error("boom"); } }, ABN)).toEqual([]);
    const calls: Array<{ table: string; args: unknown[] }> = [];
    const rows = await loadSignalsForAbn(fakeDb({ data: [abrRow, grantRow] }, calls), "95 608 464 535");
    expect(rows).toHaveLength(2);
    expect(calls[0].table).toBe("external_signals");
    expect(calls.find((c) => c.args[0] === "eq")?.args).toEqual(["eq", "entity_abn", ABN]);
  });

  it("signalsForAbn maps what the reader returns; loadProjectAbn returns a checksum-valid projects.abn or null", async () => {
    const ev = await signalsForAbn(ABN, fakeDb({ data: [grantRow] }), { now: NOW });
    expect(ev).toHaveLength(1);
    expect(ev[0].dims).toEqual(["iri", "cgh"]);
    expect(await loadProjectAbn(fakeDb({ data: { abn: "95 608 464 535" } }), "p1")).toBe(ABN);
    expect(await loadProjectAbn(fakeDb({ data: { abn: "12345678901" } }), "p1")).toBeNull();
    expect(await loadProjectAbn(fakeDb({ error: { code: "42703", message: "column abn does not exist" } }), "p1")).toBeNull();
    expect(await loadProjectAbn(null, "p1")).toBeNull();
  });
});

describe("register cohort", () => {
  const entity = (over: Partial<RegisterEntity>): RegisterEntity => ({ abn: "x", ageMonths: 24, abnActive: true, gstActive: false, state: "NSW", grants: 0, rdti: false, ...over });

  it("registerMaturityScore: age ≤ 60 (10 y), ABN 5, GST 10, grants 10 + 5 each ≤ 15, R&DTI 10 — max 100", () => {
    expect(registerMaturityScore(entity({ ageMonths: 0, abnActive: false }))).toBe(0);
    expect(registerMaturityScore(entity({ ageMonths: 120, abnActive: true, gstActive: true, grants: 3, rdti: true }))).toBe(100);
    expect(registerMaturityScore(entity({ ageMonths: 240 }))).toBe(65);
    expect(registerMaturityScore(entity({ ageMonths: 60, grants: 1 }))).toBe(45);
    expect(registerMaturityScore(entity({ ageMonths: null }))).toBe(5);
  });

  it("percentileWithinCohort is the strict share below", () => {
    expect(percentileWithinCohort(50, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(40);
    expect(percentileWithinCohort(5, [10, 20])).toBe(0);
    expect(percentileWithinCohort(999, [10, 20])).toBe(100);
    expect(percentileWithinCohort(5, [])).toBe(0);
  });

  it("aggregateRegisterEntities folds ABR / grants / R&DTI rows per ABN; buildRegisterCohort filters by state, anchors on ABR age, scores the subject", () => {
    const rows: ExternalSignalRow[] = [abrRow, grantRow, rdtiRow, { ...abrRow, entity_abn: "53666147271", value: { ...abrRow.value, state: "QLD", abn_status_from: "2023-08-15", gst_status: "NON" } }, { ...grantRow, entity_abn: "87644546770" }];
    const entities = aggregateRegisterEntities(rows, NOW);
    expect(entities.size).toBe(3);
    expect(entities.get(ABN)).toMatchObject({ abnActive: true, gstActive: true, grants: 1, rdti: true, state: "NSW" });
    expect(entities.get("87644546770")).toMatchObject({ ageMonths: null, grants: 1 });
    const all = buildRegisterCohort(entities.values(), { abn: ABN });
    expect(all.source).toBe("register_cohort");
    expect(all.n).toBe(2); // the grant-only entity has no ABR age → excluded
    expect(all.subjectFromRegister).toBe(true);
    expect(all.subjectScore).toBe(registerMaturityScore(entities.get(ABN)!));
    expect(all.industryMatched).toBe(false);
    expect(all.gstShare).toBe(0.5);
    expect(all.rdtiShare).toBe(0.5);
    const nsw = buildRegisterCohort(entities.values(), { state: "nsw", ageMonths: 30 });
    expect(nsw.n).toBe(1);
    expect(nsw.stateMatched).toBe(true);
    expect(nsw.subjectFromRegister).toBe(false);
    expect(nsw.subjectScore).toBe(registerMaturityScore({ ageMonths: 30, abnActive: true, gstActive: false, grants: 0, rdti: false }));
    expect(buildRegisterCohort(entities.values(), {}).subjectScore).toBeNull();
  });

  it("cohortFromRegisters: no db / missing table / thrown → null; rows → a cohort with the flag", async () => {
    expect(await cohortFromRegisters(null, {})).toBeNull();
    expect(await cohortFromRegisters(fakeDb({ error: { code: "42P01", message: "missing" } }), {})).toBeNull();
    expect(await cohortFromRegisters({ from: () => { throw new Error("boom"); } }, {})).toBeNull();
    const cohort = await cohortFromRegisters(fakeDb({ data: [abrRow, grantRow] }), { abn: ABN }, { now: NOW });
    expect(cohort).toMatchObject({ source: "register_cohort", n: 1, subjectFromRegister: true });
  });
});
