import { describe, it, expect } from "vitest";
import { qualifyPublicStatement, publicResearchAnalysisContext, supportsPublicAttribution, excerptDigest, type PublicStatementRequest } from "./qualify-public-statement";
import { retrievePublicSources } from "./public-sources";
import { publicResearchSchema } from "./public-source-contract";
const load = () => retrievePublicSources({ criterion: "market", question: "Who are the main competitors?", businessScope: { name: "Acme Clinic", projectId: "p1" }, sources: [{ url: "https://acme.example/pricing", role: "business" }] }, { now: () => 0, read: async () => ({ ok: true, status: 200, text: '<title>Acme Clinic</title><p>Acme Clinic does not claim AUD 200 monthly revenue. Another company reported AUD 200 monthly revenue.</p>', blocked: false, truncated: false, attempts: 1 }) });
const request = (source: Awaited<ReturnType<typeof load>>): PublicStatementRequest => ({ kind: "attributed_source_statement", sourceId: source.sources[0].id, projectId: "p1", entityName: "Acme Clinic", sourceUrl: source.sources[0].url, excerptSha256: source.sources[0].excerptSha256!, quote: source.sources[0].excerpt });
describe("source statement qualification", () => {
  it("analysis context recomputes source scope and excludes forged stored promotions", async () => {
    const source = await load();
    source.attributions![0].supportedClaim = "Acme has verified AUD 999999 revenue.";
    const context = publicResearchAnalysisContext(source);
    expect(context).not.toContain("999999");
    expect(context).not.toContain("public-attribution-");
    expect(context).toContain("not in the report citation register");
    expect(context).toContain("does not claim AUD 200");
    source.sources[0].status = "blocked";
    expect(JSON.parse(publicResearchAnalysisContext(source)).observations).toEqual([]);
  });
  it("qualifies only whole-excerpt attribution and preserves snapshot and negation", async () => {
    const source = await load(); const result = qualifyPublicStatement(source, request(source));
    expect(result.status).toBe("qualified_attribution"); expect(source.attributions).toHaveLength(1);
    if (result.status !== "qualified_attribution") throw new Error("expected attribution");
    expect(result.evidence.independentConfirmation).toBe(false);
    expect(supportsPublicAttribution(result.evidence, result.evidence.supportedClaim)).toBe(true);
    expect(supportsPublicAttribution(result.evidence, "Acme Clinic has AUD 200 monthly revenue.")).toBe(false);
    expect(supportsPublicAttribution(result.evidence, "Other Business has AUD 200 monthly revenue.")).toBe(false);
    expect(publicResearchSchema.parse(JSON.parse(JSON.stringify(source))).attributions).toEqual(source.attributions);
    expect(qualifyPublicStatement(JSON.parse(JSON.stringify(source)), request(source))).toEqual(result);
  });
  it("refuses fabricated or selectively shortened quotes even with a matching number", async () => {
    const source = await load();
    for (const quote of ["Acme Clinic has AUD 200 monthly revenue.", "Another company reported AUD 200 monthly revenue."]) {
      expect(qualifyPublicStatement(source, { ...request(source), quote })).toMatchObject({ status: "pending", reason: "quote_not_complete_excerpt" });
    }
  });
  it("refuses another entity, project, URL or missing source", async () => {
    const source = await load();
    for (const change of [{ entityName: "Another company" }, { projectId: "p2" }, { sourceUrl: "https://other.example/" }, { sourceId: "missing" }]) {
      expect(qualifyPublicStatement(source, { ...request(source), ...change }).status).toBe("pending");
    }
  });
  it("refuses stale hashes, unavailable sources and unresolved alternatives", async () => {
    for (const change of [{ status: "blocked" as const }, { role: "market_or_alternative" as const }, { excerpt: "Acme Clinic has AUD 200 monthly revenue." }, { excerptSha256: undefined }]) {
      const source = await load(); source.sources[0] = { ...source.sources[0], ...change };
      expect(qualifyPublicStatement(source, request(source)).status).toBe("pending");
    }
  });
  it("does not match brand substrings belonging to another entity", async () => {
    const source = await load(); source.sources[0].excerpt = "Acme Clinics International reports AUD 200 for an entirely different entity in another market."; source.sources[0].excerptSha256 = excerptDigest(source.sources[0].excerpt);
    expect(qualifyPublicStatement(source, request(source))).toMatchObject({ status: "pending", reason: "entity_not_in_quote" });
  });
});
