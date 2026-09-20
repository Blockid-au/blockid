// G19-S43 — the next action fits the founder: lowest criterion / first
// linked gap, never an already-satisfied generic, lift from the one model.

import { describe, expect, it } from "vitest";
import { catalogueLift, derivedLift } from "@/lib/svi-lift";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { GATHER_MISSING_CTAS, withCta } from "./evidence-cta";
import { chooseNextAction, dedupeAgainstCards, isActionSatisfied, reconcileLlmNextAction, sourceForLabel, type NextActionFacts } from "./next-action";
import type { CriterionCard, EvidenceRow } from "./schema";

const facts = (o: Partial<NextActionFacts> = {}): NextActionFacts => ({ abnVerified: false, coFounders: null, ...o });
const card = (key: CriterionCard["key"], score: number, nextAction: string, extra: Partial<CriterionCard> = {}): CriterionCard => ({ key, title: key, score, quality: "good", verdict: "", strengths: [], gaps: [], nextAction, citations: [], grounded: false, agent: "ceo", ...extra });
const row = (id: string, source: EvidenceRow["source"], status: EvidenceRow["status"], dims: EvidenceRow["dims"]): EvidenceRow => ({ evidence_id: id, source, label: id, status, dims });

describe("isActionSatisfied", () => {
  it("skips Register ABN on a verified company, Find a co-founder at ≥ 2 co-founders, Connect X when X is present", () => {
    expect(isActionSatisfied("Register ABN", facts({ abnVerified: true }), new Set())).toBe(true);
    expect(isActionSatisfied("Register ABN", facts(), new Set())).toBe(false);
    expect(isActionSatisfied("Find a co-founder", facts({ coFounders: 3 }), new Set())).toBe(true);
    expect(isActionSatisfied("Find a co-founder", facts({ coFounders: 1 }), new Set())).toBe(false);
    expect(isActionSatisfied("Connect Stripe", facts(), new Set(["stripe"]))).toBe(true);
    expect(isActionSatisfied("Connect Google Analytics", facts(), new Set(["ga4"]))).toBe(true);
    expect(isActionSatisfied("Connect GitHub", facts(), new Set(["stripe"]))).toBe(false);
  });
});

describe("chooseNextAction", () => {
  it("a pending (unassessed) chapter takes its best linked CTA at the catalogue lift, this week", () => {
    const missing = withCta(row("m", "github", "missing", ["ptd", "ftv"]), GATHER_MISSING_CTAS.repo_audit);
    const a = chooseNextAction({ dim: "ptd", score: 50, assessed: false, cards: [card("code_git", 30, "Ship CI")], evidence: [missing], facts: facts() });
    expect(a).toEqual({ title: GATHER_MISSING_CTAS.repo_audit.label, window: "this_week", expectedLift: catalogueLift("github_repo"), evidenceToAdd: "github" });
  });

  it("the lowest criterion below the strong band wins on lift over a smaller linked gap; a bigger gap wins over a 1-point criterion", () => {
    const missing = withCta(row("m", "linkedin", "missing", ["ftv"]), GATHER_MISSING_CTAS.founder_signals); // +5
    const low = chooseNextAction({ dim: "ftv", score: 60, assessed: true, cards: [card("team", 30, "Hire a CTO"), card("founder_profile", 80, "x")], evidence: [missing], facts: facts() });
    expect(low.title).toBe("Hire a CTO");
    expect(low.expectedLift).toBe(derivedLift(CRITERIA.find((c) => c.key === "team")!.weight, 30));
    expect(low.window).toBe("this_week");
    expect(low.evidenceToAdd).toBeUndefined();
    const boundary = chooseNextAction({ dim: "ftv", score: 69, assessed: true, cards: [card("team_structure", 69, "Quote D&O cover")], evidence: [missing], facts: facts() });
    expect(boundary).toMatchObject({ title: GATHER_MISSING_CTAS.founder_signals.label, evidenceToAdd: "linkedin", expectedLift: 5 });
  });

  it("the dimension's own criteria outrank a shared secondary criterion at the same score", () => {
    const a = chooseNextAction({ dim: "iri", score: 60, assessed: true, cards: [card("revenue", 50, "Lift expansion revenue"), card("documents", 50, "Upload the board minutes")], evidence: [], facts: facts() });
    expect(a.title).toBe("Upload the board minutes");
  });

  it("all criteria strong: the linked gap, then any card's step, then the generic list minus satisfied items, then 'Add evidence' on the first absent connector", () => {
    const missing = withCta(row("m", "upload", "missing", ["cgh"]), GATHER_MISSING_CTAS.cap_table);
    expect(chooseNextAction({ dim: "cgh", score: 80, assessed: true, cards: [card("team_structure", 80, "Quote D&O")], evidence: [missing], facts: facts() })).toMatchObject({ title: GATHER_MISSING_CTAS.cap_table.label, evidenceToAdd: "upload" });
    expect(chooseNextAction({ dim: "cgh", score: 80, assessed: true, cards: [card("team_structure", 80, "Quote D&O")], evidence: [], facts: facts() })).toMatchObject({ title: "Quote D&O", window: "30d" });
    // LCO generic list starts with "Register ABN" / "Register with ASIC" — neither on a verified company.
    const lco = chooseNextAction({ dim: "lco", score: 80, assessed: true, cards: [card("documents", 80, "")], evidence: [], facts: facts({ abnVerified: true }) });
    expect(lco.title).toBe("Upload legal docs");
    expect(chooseNextAction({ ...{ dim: "lco" as const, score: 80, assessed: true, cards: [card("documents", 80, "")], evidence: [] }, facts: facts() }).title).toBe("Register ABN");
    // FTV generic list starts with "Find a co-founder" — never with 3 co-founders.
    const ftv = chooseNextAction({ dim: "ftv", score: 80, assessed: true, cards: [card("team", 80, "")], evidence: [], facts: facts({ coFounders: 3 }) });
    expect(ftv.title).toBe("Build your team profile");
    expect(ftv.evidenceToAdd).toBe("linkedin");
    expect(ftv.expectedLift).toBe(catalogueLift("founder_linkedin"));
    // TRE generic list = Connect Stripe / GA / upload — with Stripe + GA4 present the upload item remains and adds an upload (catalogue: customer_list).
    const tre = chooseNextAction({ dim: "tre", score: 80, assessed: true, cards: [card("revenue", 80, "")], evidence: [row("s", "stripe", "evidenced", ["tre"]), row("g", "ga4", "evidenced", ["tre"])], facts: facts() });
    expect(tre.title).toBe("Upload revenue proof");
    expect(tre.evidenceToAdd).toBe("upload");
    expect(tre.expectedLift).toBe(catalogueLift("customer_list"));
    expect(sourceForLabel("Connect Google Analytics")).toBe("ga4");
    expect(sourceForLabel("Plan dilution")).toBeUndefined();
  });
});

describe("reconcileLlmNextAction (D2)", () => {
  it("clamps the owner's lift to the catalogue when the action adds evidence, onto 1–10 otherwise, and replaces a satisfied action", () => {
    const input = { dim: "tre" as const, score: 60, assessed: true, cards: [card("revenue", 55, "Raise prices")], evidence: [row("s", "stripe", "evidenced", ["tre"])], facts: facts() };
    expect(reconcileLlmNextAction({ title: "Connect Xero", window: "30d", expected_lift: 40, evidence_to_add: "xero" }, input)).toEqual({ title: "Connect Xero", window: "30d", expectedLift: catalogueLift("revenue_proof"), evidenceToAdd: "xero" });
    expect(reconcileLlmNextAction({ title: "Run a pricing test", window: "90d", expected_lift: 40 }, input)).toEqual({ title: "Run a pricing test", window: "90d", expectedLift: 10 });
    expect(reconcileLlmNextAction({ title: "Connect Stripe", window: "this_week", expected_lift: 8, evidence_to_add: "stripe" }, input).title).toBe("Raise prices");
  });
});

describe("dedupeAgainstCards", () => {
  it("drops chapter bullets that repeat a card bullet (ignoring citation suffixes / punctuation) and de-duplicates within the list", () => {
    const cards = [card("team", 60, "", { strengths: ["Prior exit (trade sale, 2021)"], gaps: ["Key-person risk on the CEO"] })];
    expect(dedupeAgainstCards(["Prior exit (trade sale, 2021) [ev:abc]", "Key-person risk on the CEO.", "Domain network with 3 industry bodies", "domain network with 3 industry bodies"], cards)).toEqual(["Domain network with 3 industry bodies"]);
  });
});
