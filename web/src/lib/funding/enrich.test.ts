// S9-B: the enrichment builders are pure functions of the row. Fixtures pin
// the section rules (present / omitted per field, FAQ only from fields, AEST
// dates, no `undefined` / `null` leaking into text); the seed sweep pins the
// word-count floor and link integrity across every real program + grant.

import { describe, expect, it } from "vitest";
import grantsSeed from "../../../content/data/grants-au.seed.json";
import programsSeed from "../../../content/data/programs-au.seed.json";
import manifest from "../../../content/insights/manifest.json";
import { mapGrantSeeds, mapProgramSeeds, type AuGrantRow, type AuProgramRow } from "./seed-map";
import { validateJsonLd } from "@/lib/seo/structured-data";
import {
  FAQ_JSON_LD_MIN,
  FAQ_MAX,
  FUNDING_CTA,
  FUNDING_INSIGHTS,
  RELATED_LIMIT,
  buildFaqJsonLd,
  costInWords,
  enrichGrant,
  enrichProgram,
  enrichmentWordCount,
  equityInWords,
  grantAtAGlance,
  grantFaq,
  grantHowToApply,
  grantTiming,
  grantWhatYouGet,
  grantWhoItIsFor,
  insightForGrant,
  insightForProgram,
  joinAnd,
  neutralProfile,
  programAtAGlance,
  programFaq,
  programHowToApply,
  programTiming,
  programWhatYouGet,
  programWhoItIsFor,
  relatedGrants,
  relatedGrantsForProgram,
  relatedPrograms,
  relatedProgramsForGrant,
} from "./enrich";

const TODAY = new Date(Date.UTC(2026, 8, 11));

const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants);
const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);
const indexable = grants.filter((g) => !g.exclude_from_matching);

function program(over: Partial<AuProgramRow>): AuProgramRow {
  return {
    id: "p",
    name: "Test Program",
    operator: null,
    program_type: "accelerator",
    city: "Sydney",
    capital: "Sydney",
    state: "NSW",
    venue: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    length_weeks: null,
    intake_months: [],
    applications_open: null,
    applications_close: null,
    next_cohort_start: null,
    benefits: [],
    funding_aud: null,
    equity_pct: null,
    cost_to_founder: null,
    eligibility: {},
    status: "open",
    official_url: "https://example.org/apply",
    summary: null,
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "medium",
    ...over,
  };
}

function grant(over: Partial<AuGrantRow>): AuGrantRow {
  return {
    id: "g",
    name: "Test Grant",
    provider: null,
    level: "federal",
    state: "national",
    funding_type: "grant",
    amount_min_aud: null,
    amount_max_aud: null,
    amount_note: null,
    co_contribution: null,
    stage_tags: [],
    industry_tags: [],
    demographic_tags: [],
    eligibility: {},
    application_window: null,
    opens_at: null,
    closes_at: null,
    lodgement_deadline: null,
    next_round_note: null,
    status: "open",
    superseded_by: null,
    exclude_from_matching: false,
    official_url: "https://example.gov.au/grant",
    source_url: null,
    summary: null,
    how_to_apply: null,
    evidence_needed: [],
    last_verified_at: null,
    verified_by: "seed",
    status_confidence: "medium",
    sources: null,
    application_prompts: [],
    ...over,
  };
}

/** Every string in a nested object, for the leak check. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const LEAK = /\b(undefined|null|NaN|\[object Object\])\b/;

describe("enrich — helpers", () => {
  it("joinAnd joins en-AU style and skips blanks", () => {
    expect(joinAnd([])).toBe("");
    expect(joinAnd(["a"])).toBe("a");
    expect(joinAnd(["a", "b"])).toBe("a and b");
    expect(joinAnd(["a", "", "b", "c"])).toBe("a, b and c");
  });

  it("equity + cost fields render in plain words, null stays null", () => {
    expect(equityInWords(null)).toBeNull();
    expect(equityInWords("none")).toBe("No equity taken");
    expect(equityInWords("n/a")).toBe("No equity taken");
    expect(equityInWords("none (debt)")).toBe("No equity taken — none (debt)");
    expect(equityInWords("not published")).toBe("Equity terms not published");
    expect(equityInWords("7% + MFN SAFE")).toBe("Equity: 7% + MFN SAFE");
    expect(costInWords(null)).toBeNull();
    expect(costInWords("free")).toBe("Free to founders");
    expect(costInWords("free (fully funded)")).toBe("Free to founders (fully funded)");
    expect(costInWords("not stated")).toBe("Cost not published");
    expect(costInWords("A$100/yr + GST")).toBe("Cost to founder: A$100/yr + GST");
  });

  it("neutralProfile carries only state, first founder stage and sectors — no financial or demographic fields", () => {
    const p = neutralProfile({ state: "QLD", stage_tags: ["scaling", "mvp"], industry_tags: ["ai_ml"] });
    expect(p).toEqual({ state: "QLD", stage: "mvp", industry_tags: ["ai_ml"] });
    expect(neutralProfile({ state: "national", stage_tags: [], industry_tags: [] })).toEqual({ state: "NSW", stage: "mvp", industry_tags: null });
    expect(neutralProfile({ state: "national", stage_tags: [], industry_tags: [] }, "Perth").state).toBe("WA");
  });

  it("FAQPage JSON-LD only from two or more Q&As and validates", () => {
    expect(buildFaqJsonLd([])).toBeNull();
    expect(buildFaqJsonLd([{ question: "Q?", answer: "A." }])).toBeNull();
    const ld = buildFaqJsonLd([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
    expect(ld?.["@type"]).toBe("FAQPage");
    expect(validateJsonLd(ld)).toEqual({ ok: true, errors: [] });
    expect(FAQ_JSON_LD_MIN).toBe(2);
  });
});

describe("enrich — program builders (fixtures)", () => {
  const bare = program({});
  const full = program({
    id: "full",
    name: "Full Accelerator",
    operator: "Ops Pty Ltd",
    venue: "Startup Hub, 11 York St",
    stage_tags: ["mvp", "early_revenue"],
    industry_tags: ["ai_ml", "healthtech_medtech"],
    demographic_tags: ["women_led"],
    length_weeks: 12,
    intake_months: [2, 8],
    applications_open: "2026-10-01",
    applications_close: "2026-11-08",
    next_cohort_start: "2027-02-01",
    benefits: ["Mentoring", "Demo day"],
    funding_aud: 50000,
    equity_pct: "7% + MFN SAFE",
    cost_to_founder: "free",
    eligibility: { is_company_acn: true, turnover_max: 1000000 },
    summary: "Twelve-week AI health accelerator",
    last_verified_at: "2026-09-10",
    status_confidence: "high",
  });

  it("At a glance: only present fields, AEST date for the close, satellite cities on the Where fact", () => {
    const facts = programAtAGlance(full, TODAY);
    const labels = facts.map((f) => f.label);
    expect(labels).toEqual(["Type", "Run by", "Where", "Stage fit", "Sectors", "Designed for", "Funding", "Equity", "Cost", "Length", "Usual intake", "Applications close", "Status", "Verified"]);
    expect(facts.find((f) => f.label === "Applications close")?.value).toBe("8 Nov 2026 (AEST)");
    expect(facts.find((f) => f.label === "Where")?.value).toBe("Sydney, New South Wales — listed under Sydney with Wollongong");
    expect(facts.find((f) => f.label === "Equity")?.value).toBe("Equity: 7% + MFN SAFE");
    expect(facts.find((f) => f.label === "Sectors")?.value).toBe("AI and machine learning, healthtech and medtech");
    const bareLabels = programAtAGlance(bare, TODAY).map((f) => f.label);
    expect(bareLabels).toEqual(["Type", "Where", "Status"]);
  });

  it("At a glance: WA dates read AWST, Remote rows read online", () => {
    const wa = program({ state: "WA", city: "Perth", capital: "Perth", applications_close: "2026-11-08" });
    expect(programAtAGlance(wa, TODAY).find((f) => f.label === "Applications close")?.value).toBe("8 Nov 2026 (AWST)");
    const remote = program({ state: "national", city: "Remote", capital: "Remote", applications_open: "rolling" });
    const facts = programAtAGlance(remote, TODAY);
    expect(facts.find((f) => f.label === "Where")?.value).toBe("Online / Australia-wide");
    expect(facts.find((f) => f.label === "Applications")?.value).toBe("Rolling — apply any time");
  });

  it("Who it is for: fixed vocabulary from tags; no tags → 'open to most Australian founders at any stage'", () => {
    const s = programWhoItIsFor(full);
    expect(s[0]).toBe("Full Accelerator is aimed at startups with an MVP in users' hands and companies earning their first revenue, working in AI and machine learning and healthtech and medtech.");
    expect(s[1]).toBe("On BlockID's stage ladder, MVP means a minimum product is live with real users; early revenue means paying customers but not yet repeatable growth.");
    expect(s[2]).toBe("It is designed for women-led teams.");
    expect(s[3]).toBe("It is based in Sydney, New South Wales, and sits on the Sydney page alongside programs in Wollongong.");
    expect(s[4]).toBe("The listing records 2 eligibility gates: incorporated company (acn) (Yes) and annual turnover at most (A$1,000,000).");
    expect(programWhoItIsFor(bare)).toEqual([
      "Test Program lists no stage or sector restriction, so it is open to most Australian founders at any stage.",
      "It is based in Sydney, New South Wales, and sits on the Sydney page alongside programs in Wollongong.",
    ]);
    const stageOnly = programWhoItIsFor(program({ stage_tags: ["idea"], capital: "Remote", city: "Remote", state: "national" }));
    expect(stageOnly[0]).toBe("Test Program is open to most Australian founders at the idea stage — founders still at the idea stage — with no sector restriction listed.");
    expect(stageOnly[1]).toBe("On BlockID's stage ladder, idea means a problem and a proposed solution, but nothing built yet.");
    expect(stageOnly[2]).toBe("Delivery is online or Australia-wide, so where you are based is not a barrier.");
  });

  it("What you get: generic type explainer + summary + benefits + funding / equity / cost / length / venue, each only when present", () => {
    const s = programWhatYouGet(full);
    expect(s[0]).toMatch(/^An accelerator is a fixed-length, cohort-based program/);
    expect(s).toContain("Twelve-week AI health accelerator.");
    expect(s).toContain("The listing records 2 benefits: Mentoring and Demo day.");
    expect(s).toContain('It lists up to A$50,000 in funding, with equity terms recorded as "7% + MFN SAFE".');
    expect(s).toContain("It is free for founders.");
    expect(s).toContain("It runs for 12 weeks.");
    expect(s).toContain("Sessions are held at Startup Hub, 11 York St.");
    expect(programWhatYouGet(program({ program_type: "mystery_type" }))).toEqual([]);
    expect(programWhatYouGet(program({ funding_aud: 20000, equity_pct: "none" }))[1]).toBe("It lists up to A$20,000 in funding and takes no equity.");
    expect(programWhatYouGet(program({ equity_pct: "none" }))[1]).toBe("It takes no equity, and no fixed funding amount is listed.");
    expect(programWhatYouGet(program({ equity_pct: "none (Kickstart+ SAFE optional)" }))[1]).toBe('Equity is recorded as "none (Kickstart+ SAFE optional)"; no fixed funding amount is listed.');
    expect(programFaq(program({ equity_pct: "none (debt)" }), TODAY)[0].answer).toBe('Not by default — the listing records equity as "none (debt)". Confirm the current terms on the official page.');
  });

  it("How to apply: intake months, dated window (AEST), next cohort, gates, then the official-page step; rolling reads rolling", () => {
    const h = programHowToApply(full);
    expect(h.steps).toEqual([
      "Cohorts usually start in February and August — plan to apply well before the intake month.",
      "Applications open 1 Oct 2026 (AEST) and close 8 Nov 2026 (AEST).",
      "The next cohort is listed to start 1 Feb 2027 (AEST).",
      "Have evidence ready for the recorded gates: incorporated company (acn) and annual turnover at most.",
      "Accelerators usually shortlist from a written application and then interview the team, so have your deck, traction and cap table ready before the window opens.",
      "Apply through the official accelerator page — BlockID lists the program but never handles applications.",
    ]);
    expect(h.officialUrl).toBe("https://example.org/apply");
    expect(h.prompts).toEqual([]);
    // S16-A: seeded application_prompts (0329) surface as "You will be asked", capped at three like grants.
    const seeded = programHowToApply(
      program({ application_prompts: [{ id: "a", question: "Q one?" }, { id: "b", question: "Q two?" }, { id: "c", question: "Q three?" }, { id: "d", question: "Q four?" }] }),
    );
    expect(seeded.prompts).toEqual(["Q one?", "Q two?", "Q three?"]);
    expect(programHowToApply(program({ applications_open: "rolling" })).steps[0]).toBe("Applications are rolling — you can apply at any time.");
    // Bare accelerator: the generic type hint + the official-page step only.
    expect(programHowToApply(bare).steps).toHaveLength(2);
    expect(programHowToApply(program({ program_type: "mystery_type" })).steps).toHaveLength(1);
  });

  it("Timing: the deadline-status ladder drives the rung; closed / paused / estimated windows are labelled as such", () => {
    const t = programTiming(full, TODAY);
    expect(t.status).toBe("future"); // opens 1 Oct 2026, today is 11 Sep
    expect(t.sentences[0]).toBe("Applications close 8 Nov 2026 (AEST); dates are calendar days in AEST.");
    expect(t.sentences.at(-1)).toBe("Status was last verified on 10 Sep 2026; confirm on the official page before you apply.");
    const soon = programTiming(program({ applications_close: "2026-09-30" }), TODAY);
    expect(soon.status).toBe("last_call");
    expect(soon.label).toBe("Closes in 19 days — 30 Sep 2026");
    const closed = programTiming(program({ status: "closed" }), TODAY);
    expect(closed.status).toBe("overdue");
    expect(closed.sentences).toContain("The listing is marked closed — do not apply until the operator announces the next round.");
    const est = programTiming(program({ intake_months: [3] }), TODAY);
    expect(est.sentences.some((s) => s.includes("estimated at") && s.includes("an estimate, not a published date"))).toBe(true);
    expect(programTiming(bare, TODAY).sentences).toEqual([
      "Rolling — apply any time.",
      "Open means the operator was accepting applications or members when BlockID last checked the listing.",
    ]);
  });

  it("FAQ: one question per present field, capped at four, none when the fields are missing", () => {
    const faq = programFaq(full, TODAY);
    expect(faq.map((q) => q.question)).toEqual([
      "Does Full Accelerator take equity?",
      "Does it cost anything to join Full Accelerator?",
      "How long does Full Accelerator run?",
      "When are the next applications for Full Accelerator?",
    ]);
    expect(faq[0].answer).toBe('Yes, in some form. The listed equity terms are "7% + MFN SAFE". Confirm the current terms on the official page before you sign anything.');
    expect(faq[1].answer).toBe("No. It is listed as free to founders.");
    expect(faq[2].answer).toBe("12 weeks, with cohorts usually starting in February and August.");
    expect(faq[3].answer).toBe("Applications close: 8 Nov 2026 (AEST). Status is open, verified 10 Sep 2026.");
    expect(faq.length).toBeLessThanOrEqual(FAQ_MAX);
    // Bare row: only the "where" question survives (city is always set), so no FAQPage.
    const bareFaq = programFaq(bare, TODAY);
    expect(bareFaq.map((q) => q.question)).toEqual(["Where is Test Program held?"]);
    expect(buildFaqJsonLd(bareFaq)).toBeNull();
    expect(programFaq(program({ equity_pct: "none", funding_aud: 20000 }), TODAY)[0].answer).toBe("No. The listing records no equity taken, with up to A$20,000 in funding.");
  });

  it("Related: same-capital programs by shared tags, grants via the matcher, insight by type / sector / stage, /funding CTA", () => {
    const pool = [
      full,
      program({ id: "a", name: "A", capital: "Sydney", stage_tags: ["mvp"], industry_tags: ["ai_ml"] }),
      program({ id: "b", name: "B", capital: "Sydney", stage_tags: ["idea"], industry_tags: [] }),
      program({ id: "c", name: "C", capital: "Melbourne", stage_tags: ["mvp"], industry_tags: ["ai_ml", "healthtech_medtech"] }),
      program({ id: "d", name: "D", capital: "Sydney", stage_tags: ["early_revenue"], industry_tags: ["healthtech_medtech"], status: "closed" }),
      program({ id: "e", name: "E", capital: "Sydney", program_type: "incubator" }),
    ];
    const rel = relatedPrograms(full, pool);
    expect(rel.map((r) => r.name)).toEqual(["A", "D", "B"]); // A: 1 stage + 2 industry; D: 1 + 2 but closed; B: same type
    expect(rel[0]).toEqual({ href: "/funding/programs/sydney/a", name: "A", meta: "Accelerator · Sydney · Open" });
    expect(rel.some((r) => r.name === "C")).toBe(false);
    expect(rel.length).toBeLessThanOrEqual(RELATED_LIMIT);

    const g = relatedGrantsForProgram(full, indexable, TODAY);
    expect(g.length).toBe(RELATED_LIMIT);
    for (const r of g) expect(r.href).toMatch(/^\/funding\/grants\/[^/]+$/);

    expect(insightForProgram(full)).toEqual(FUNDING_INSIGHTS.rounds);
    expect(insightForProgram(program({ program_type: "vc", equity_pct: null }))).toEqual(FUNDING_INSIGHTS.rounds);
    expect(insightForProgram(program({ program_type: "rd_advance_loan" }))).toEqual(FUNDING_INSIGHTS.rdti);
    expect(insightForProgram(program({ industry_tags: ["quantum"] }))).toEqual(FUNDING_INSIGHTS.rdti);
    expect(insightForProgram(program({ funding_aud: 10000, equity_pct: "none" }))).toEqual(FUNDING_INSIGHTS.nonDilutive);
    expect(insightForProgram(program({ stage_tags: ["idea", "pre_revenue_prototype"] }))).toEqual(FUNDING_INSIGHTS.bootstrapping);
    expect(insightForProgram(program({ stage_tags: ["early_revenue", "scaling"] }))).toEqual(FUNDING_INSIGHTS.revenueBased);
    expect(insightForProgram(bare)).toEqual(FUNDING_INSIGHTS.grants);

    const e = enrichProgram(full, { programs: pool, grants: indexable, today: TODAY });
    expect(e.related.funding).toEqual(FUNDING_CTA);
    expect(e.related.capital).toEqual({ href: "/funding/programs/sydney", label: "All Sydney programs" });
    expect(e.related.stateGrants).toEqual({ href: "/funding/grants?state=NSW", label: "New South Wales startup grants" });
    expect(e.faqJsonLd?.["@type"]).toBe("FAQPage");
  });
});

describe("enrich — grant builders (fixtures)", () => {
  const bare = grant({});
  const full = grant({
    id: "full",
    name: "Full Grant",
    provider: "Dept of Things",
    level: "state",
    state: "NSW",
    funding_type: "matched_grant",
    amount_min_aud: 25000,
    amount_max_aud: 200000,
    amount_note: "Up to 50% of project costs",
    co_contribution: "50%",
    stage_tags: ["mvp", "early_revenue"],
    industry_tags: ["cleantech_renewables"],
    demographic_tags: ["regional_founder"],
    eligibility: { is_company_acn: true, hq_required: "NSW" },
    application_window: "annual_round",
    opens_at: "2026-09-01",
    closes_at: "2026-11-30",
    lodgement_deadline: "Submit by 5pm",
    next_round_note: "Round 5 expected March 2027",
    summary: "Matched funding for clean prototypes",
    how_to_apply: "Lodge through the SmartyGrants portal.",
    evidence_needed: ["Project plan", "Budget", "Quotes"],
    application_prompts: [
      { id: "a", question: "Q one?" },
      { id: "b", question: "Q two?" },
      { id: "c", question: "Q three?" },
      { id: "d", question: "Q four?" },
    ],
    last_verified_at: "2026-09-10",
    status_confidence: "high",
  });

  it("At a glance: type, provider, level, coverage, amount, co-contribution, tags, window, AEST dates, lodgement, status, verified", () => {
    const facts = grantAtAGlance(full);
    expect(facts.map((f) => f.label)).toEqual(["Type", "Provider", "Level", "Coverage", "Amount", "Co-contribution", "Stage fit", "Sectors", "Reserved for", "Window", "Opens", "Closes", "Lodgement", "Status", "Verified"]);
    expect(facts.find((f) => f.label === "Closes")?.value).toBe("30 Nov 2026 (AEST)");
    expect(facts.find((f) => f.label === "Amount")?.value).toBe("A$25,000 – A$200,000");
    expect(facts.find((f) => f.label === "Reserved for")?.value).toBe("founders based outside a capital city");
    expect(grantAtAGlance(bare).map((f) => f.label)).toEqual(["Type", "Level", "Coverage", "Amount", "Status"]);
    expect(grantAtAGlance(grant({ co_contribution: "none" })).find((f) => f.label === "Co-contribution")?.value).toBe("None required");
  });

  it("Who it is for: scope + stage + sector + demographic + gates + superseded note", () => {
    const s = grantWhoItIsFor(full);
    expect(s[0]).toBe("Full Grant is aimed at New South Wales startups — startups with an MVP in users' hands and companies earning their first revenue — working in cleantech and renewables.");
    expect(s[1]).toMatch(/^On BlockID's stage ladder, MVP means/);
    expect(s[2]).toBe("It is reserved for founders based outside a capital city.");
    expect(s[3]).toBe("The listing records 2 eligibility gates: incorporated company (acn) (Yes) and headquartered in (NSW).");
    expect(grantWhoItIsFor(bare)).toEqual(["Test Grant lists no stage or sector restriction, so it is open to most Australian startups in any state."]);
    expect(grantWhoItIsFor(grant({ superseded_by: "igp" })).at(-1)).toBe("This scheme has been superseded by igp; it stays listed for reference.");
  });

  it("What you get: funding-type explainer, summary, amount range + note, co-contribution, what the evidence says the money funds", () => {
    const s = grantWhatYouGet(full);
    expect(s[0]).toMatch(/^A matched grant pays a share of an approved project/);
    expect(s[1]).toBe("Matched funding for clean prototypes.");
    expect(s[2]).toBe("Full Grant provides A$25,000 – A$200,000 (Up to 50% of project costs).");
    expect(s[3]).toBe('A co-contribution is required — listed as "50%" — so budget for your share before you apply.');
    expect(s[4]).toBe("The money is assessed against evidence of project plan, budget and quotes, which tells you what it is expected to fund.");
    expect(grantWhatYouGet(bare)).toEqual(["A grant is money you do not repay and that takes no equity; it is paid against an approved project and its milestones."]);
    expect(grantWhatYouGet(grant({ co_contribution: "none" }))[1]).toBe("No co-contribution is required.");
  });

  it("How to apply: how_to_apply intro, window explainer, dated round (AEST), lodgement, next-round note, gates, official-portal step, evidence list, first three prompts", () => {
    const h = grantHowToApply(full);
    expect(h.intro).toBe("Lodge through the SmartyGrants portal.");
    expect(h.steps).toEqual([
      "The scheme runs one funding round a year.",
      "The current round opens 1 Sep 2026 (AEST) and closes 30 Nov 2026 (AEST).",
      "Lodgement deadline: Submit by 5pm.",
      "Next round: Round 5 expected March 2027.",
      "Confirm you pass the recorded gates first: incorporated company (acn) and headquartered in.",
      "Apply on the official state portal — BlockID lists the matched grant but never lodges applications.",
    ]);
    expect(h.evidence).toEqual(["Project plan", "Budget", "Quotes"]);
    expect(h.prompts).toEqual(["Q one?", "Q two?", "Q three?"]);
    const b = grantHowToApply(bare);
    expect(b.intro).toBeNull();
    expect(b.steps).toEqual(["Apply on the official federal portal — BlockID lists the grant but never lodges applications."]);
    expect(b.evidence).toEqual([]);
    expect(b.prompts).toEqual([]);
  });

  it("Timing: ladder rung + days-until in AEST, window explainer, next-round note, lodgement; closed rows say so", () => {
    const t = grantTiming(full, TODAY);
    expect(t.status).toBe("open"); // 80 days out
    expect(t.sentences[0]).toBe("Applications close 30 Nov 2026 (AEST) — in 80 days; deadlines are calendar days in AEST.");
    expect(t.sentences).toContain("The scheme runs one funding round a year.");
    expect(t.sentences).toContain("Round 5 expected March 2027.");
    expect(t.sentences).toContain("Lodgement deadline: Submit by 5pm.");
    const past = grantTiming(grant({ closes_at: "2026-04-10", status: "closed" }), TODAY);
    expect(past.status).toBe("overdue");
    expect(past.sentences[0]).toBe("The last recorded round closed 10 Apr 2026 (AEST).");
    const openExplainer = "Open means the operator was accepting applications or members when BlockID last checked the listing.";
    expect(grantTiming(bare, TODAY).sentences).toEqual(["Rolling — apply any time.", openExplainer]);
    expect(grantTiming(grant({ application_window: "rolling" }), TODAY).sentences).toEqual([
      "Applications are accepted on a rolling basis rather than in fixed rounds.",
      openExplainer,
    ]);
  });

  it("FAQ: amount, co-contribution, close, provider, evidence — only from present fields, capped at four", () => {
    const faq = grantFaq(full);
    expect(faq.map((q) => q.question)).toEqual([
      "How much does Full Grant provide?",
      "Do I need to co-contribute to Full Grant?",
      "When does Full Grant close?",
      "Who runs Full Grant?",
    ]);
    expect(faq[0].answer).toBe("A$25,000 – A$200,000 — Up to 50% of project costs.");
    expect(faq[1].answer).toBe('Yes — the listed co-contribution is "50%".');
    expect(faq[2].answer).toBe("The current round closes 30 Nov 2026 (AEST). The scheme runs one funding round a year. Round 5 expected March 2027.");
    expect(faq[3].answer).toBe("Dept of Things — a state matched grant for New South Wales.");
    expect(grantFaq(bare)).toEqual([]);
    expect(grantFaq(grant({ evidence_needed: ["Plan", "Budget."] }))).toEqual([{ question: "What evidence do I need for Test Grant?", answer: "Plan and Budget." }]);
    expect(grantFaq(grant({ co_contribution: "none" }))[0].answer).toBe("No — the listing records no co-contribution.");
  });

  it("Related: grants in the same state / federal via the matcher (self excluded), programs from the state's capital, insight by funding type", () => {
    const rel = relatedGrants(full, indexable, TODAY);
    expect(rel.length).toBe(RELATED_LIMIT);
    expect(rel.some((r) => r.href === "/funding/grants/full")).toBe(false);
    for (const r of rel) {
      const row = indexable.find((g) => r.href === `/funding/grants/${encodeURIComponent(g.id)}`);
      expect(row, r.href).toBeDefined();
      expect(["national", "NSW"]).toContain(row!.state);
    }
    const federal = relatedGrants(grant({ id: "x", state: "national" }), indexable, TODAY);
    for (const r of federal) expect(r.meta).toContain("Federal");

    const progs = relatedProgramsForGrant(full, programs, TODAY);
    expect(progs.length).toBe(RELATED_LIMIT);
    for (const r of progs) expect(r.href).toMatch(/^\/funding\/programs\/sydney\//);
    const remote = relatedProgramsForGrant(grant({ state: "national" }), programs, TODAY);
    for (const r of remote) expect(r.href).toMatch(/^\/funding\/programs\/remote\//);
    // Falls back to tag-scored rows when the capital has too few and the matcher admits nothing else (in-person Melbourne fails the NSW location gate).
    const tiny = relatedProgramsForGrant(full, [program({ id: "m", capital: "Melbourne", city: "Melbourne", state: "VIC" })], TODAY);
    expect(tiny.map((r) => r.name)).toEqual(["Test Program"]);

    expect(insightForGrant(grant({ id: "esic", funding_type: "tax_offset_nonrefundable" }))).toEqual(FUNDING_INSIGHTS.esic);
    expect(insightForGrant(grant({ id: "rdti", funding_type: "tax_offset_refundable" }))).toEqual(FUNDING_INSIGHTS.rdti);
    expect(insightForGrant(grant({ funding_type: "tax_deduction" }))).toEqual(FUNDING_INSIGHTS.rdti);
    expect(insightForGrant(grant({ funding_type: "loan_concessional" }))).toEqual(FUNDING_INSIGHTS.ventureDebt);
    expect(insightForGrant(grant({ funding_type: "co_investment" }))).toEqual(FUNDING_INSIGHTS.rounds);
    expect(insightForGrant(full)).toEqual(FUNDING_INSIGHTS.grants);

    const e = enrichGrant(full, { programs, grants: indexable, today: TODAY });
    expect(e.related.funding).toEqual(FUNDING_CTA);
    expect(e.related.stateGrants).toEqual({ href: "/funding/grants?state=NSW", label: "All New South Wales grants" });
    expect(e.faqJsonLd?.["@type"]).toBe("FAQPage");
    expect(enrichGrant(bare, { programs, grants: indexable, today: TODAY }).faqJsonLd).toBeNull();
  });
});

describe("enrich — seed sweep", () => {
  const ctx = { programs, grants: indexable, today: TODAY };
  const programEnrichments = programs.map((p) => [p, enrichProgram(p, ctx)] as const);
  const grantEnrichments = indexable.map((g) => [g, enrichGrant(g, ctx)] as const);

  it("no `undefined` / `null` / NaN leaks into any rendered string, and no string is blank", () => {
    for (const [row, e] of [...programEnrichments, ...grantEnrichments]) {
      for (const s of strings(e)) {
        expect(s.trim().length, `${row.id}: blank string`).toBeGreaterThan(0);
        expect(s, `${row.id}: ${s}`).not.toMatch(LEAK);
      }
    }
  });

  it("every day-level dated fact carries an AU zone suffix; month-only seed dates stay 'Mon YYYY'", () => {
    const zoned = /\(A[EWC]ST\)$|^[A-Z][a-z]{2} \d{4}$/;
    for (const [, e] of [...programEnrichments, ...grantEnrichments]) {
      for (const f of e.atAGlance) {
        if (["Applications close", "Last close", "Next cohort", "Applications open", "Opens", "Closes"].includes(f.label)) expect(f.value).toMatch(zoned);
      }
    }
  });

  it("every program gets ≥ 250 words of enrichment (median ≥ 300; header, benefits and checklist lift every page past 300), 3 related programs where the capital has them, 3 related grants, a capital link and an insight from the nine funding articles", () => {
    const slugs = new Set(Object.values(FUNDING_INSIGHTS).map((i) => i.slug));
    const manifestSlugs = new Set((manifest as { articles: { slug: string }[] }).articles.map((a) => a.slug));
    for (const s of slugs) expect(manifestSlugs.has(s), s).toBe(true);
    const counts: number[] = [];
    for (const [p, e] of programEnrichments) {
      counts.push(enrichmentWordCount(e));
      const others = programs.filter((o) => o.capital === p.capital && o.id !== p.id).length;
      expect(e.related.programs.length, p.id).toBe(Math.min(RELATED_LIMIT, others));
      expect(e.related.grants.length, p.id).toBe(RELATED_LIMIT);
      expect(e.related.capital.href).toBe(`/funding/programs/${p.capital.toLowerCase()}`);
      expect(slugs.has(e.related.insight.slug)).toBe(true);
      expect(e.whoItIsFor.length).toBeGreaterThan(0);
      expect(e.howToApply.steps.length).toBeGreaterThan(0);
      expect(e.timing.sentences.length).toBeGreaterThan(0);
      if (e.faq.length >= FAQ_JSON_LD_MIN) expect(validateJsonLd(e.faqJsonLd)).toEqual({ ok: true, errors: [] });
      else expect(e.faqJsonLd).toBeNull();
    }
    const sorted = [...counts].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(250);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThanOrEqual(300);
  });

  it("every grant gets ≥ 280 words of enrichment (median ≥ 300), related grants only from its state or federal, 3 related programs, an insight from the nine", () => {
    const slugs = new Set(Object.values(FUNDING_INSIGHTS).map((i) => i.slug));
    const counts: number[] = [];
    for (const [g, e] of grantEnrichments) {
      counts.push(enrichmentWordCount(e));
      expect(e.related.programs.length, g.id).toBe(RELATED_LIMIT);
      expect(e.related.grants.length, g.id).toBeGreaterThan(0);
      for (const r of e.related.grants) {
        const row = indexable.find((o) => r.href === `/funding/grants/${encodeURIComponent(o.id)}`)!;
        expect(row.id).not.toBe(g.id);
        expect(["national", g.state]).toContain(row.state);
      }
      expect(slugs.has(e.related.insight.slug)).toBe(true);
      expect(e.howToApply.prompts.length).toBeLessThanOrEqual(3);
      if (e.faq.length >= FAQ_JSON_LD_MIN) expect(validateJsonLd(e.faqJsonLd)).toEqual({ ok: true, errors: [] });
      else expect(e.faqJsonLd).toBeNull();
    }
    const sorted = [...counts].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(280);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThanOrEqual(300);
  });

  it("FAQ answers never come from anywhere but the row: every FAQ question names the row and every grant FAQ maps to a present field", () => {
    for (const [g, e] of grantEnrichments) {
      for (const q of e.faq) {
        expect(q.question).toContain(g.name);
        if (q.question.startsWith("How much")) expect(g.amount_max_aud || g.amount_min_aud || g.amount_note).toBeTruthy();
        if (q.question.startsWith("Do I need to co-contribute")) expect(g.co_contribution).toBeTruthy();
        if (q.question.startsWith("Who runs")) expect(g.provider).toBeTruthy();
        if (q.question.startsWith("What evidence")) expect(g.evidence_needed.length).toBeGreaterThan(0);
      }
    }
    for (const [p, e] of programEnrichments) {
      for (const q of e.faq) {
        expect(q.question).toContain(p.name);
        if (q.question.startsWith("Does") && q.question.includes("equity")) expect(p.equity_pct).toBeTruthy();
        if (q.question.startsWith("How long")) expect(p.length_weeks).toBeTruthy();
      }
    }
  });
});
