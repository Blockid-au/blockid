// Colocated suite for the "What we read" builder (S32-B).
//
// Pins: every row is present with a "not provided" (null) value when the
// input is empty; sources cite the slide number / page URL / "your text";
// revenue, traction, ask and team are pulled out of real founder phrasing;
// the prompt block never invents a value; nothing throws on garbage.

import { describe, expect, it } from "vitest";

import { buildInputEcho, echoToPromptBlock, extractUrls, locateSource } from "./input-echo";

const SIGNALS_BASE = {
  hasCoFounder: false,
  founderExperience: "first-time" as const,
  founderSectorFit: false,
  hasAdvisors: false,
  hasRevenue: false,
  sector: undefined as string | undefined,
};

describe("buildInputEcho", () => {
  it("renders every row as not provided for an empty input, and still names the company", () => {
    const echo = buildInputEcho({ inputKind: "idea_text", rawText: "", structured: {}, signals: SIGNALS_BASE });
    expect(echo.total).toBe(11);
    expect(echo.provided).toBe(0);
    // G14-S37: the founder-profile row is present and "not provided" with the Execution-tab hint.
    const founder = echo.rows.find((r) => r.key === "founder");
    expect(founder?.value).toBeNull();
    expect(founder?.hint).toMatch(/Execution tab/);
    expect(echo.rows.every((r) => r.value === null && r.source === null)).toBe(true);
    expect(echo.rows.every((r) => r.hint.length > 10)).toBe(true);
    expect(echo.company).toBe("Your startup");
    expect(echo.companyKnown).toBe(false);
    expect(echo.claims).toEqual([]);
    expect(echo.slideTitles).toEqual([]);
  });

  it("G14-S37: echoes the structured founder profile (rubric score + the rows that earned points, cap note) from signals.founderExecution", () => {
    const echo = buildInputEcho({
      inputKind: "idea_text",
      rawText: "A rostering app for aged care.",
      structured: {},
      signals: {
        ...SIGNALS_BASE,
        founderExecution: {
          score: 70,
          rawScore: 96,
          capped: true,
          capReason: "Self-reported profile — capped at 70",
          rubricVersion: "1.0",
          sources: ["founder"],
          breakdown: [
            { key: "exits", points: 15, max: 30, evidence: "Loom (acquisition 2020)" },
            { key: "raises", points: 0, max: 15, evidence: "no prior raise declared" },
            { key: "years_in_domain", points: 20, max: 20, evidence: "12 years in domain (scored at the 10-year cap)" },
            { key: "roles", points: 10, max: 15, evidence: "CEO: Ada, CTO: Charles" },
            { key: "full_time", points: 10, max: 10, evidence: "100% full-time" },
            { key: "worked_together", points: 0, max: 5, evidence: "not stated" },
            { key: "github", points: 1, max: 5, evidence: "GitHub URL only" },
          ],
        },
      },
    });
    const founder = echo.rows.find((r) => r.key === "founder");
    expect(founder?.source).toBe("from your founder profile");
    expect(founder?.value).toMatch(/^Execution 70\/100 \(self-reported, capped at 70\) — exits: Loom \(acquisition 2020\); years in domain: 12 years/);
    expect(founder?.value).not.toContain("prior raises");
    expect(echo.provided).toBeGreaterThanOrEqual(1);
    expect(echoToPromptBlock(echo)).toContain("Founder profile: Execution 70/100");
  });

  it("pulls company, one-liner, revenue, traction, ask and team out of typed text", () => {
    const rawText =
      "Kelpie is a rostering app for regional aged-care providers. " +
      "We have 42 paying customers and MRR of A$18,500 growing 12% a month. " +
      "We are raising A$1.2M pre-seed to hire two engineers. " +
      "Team of 4 with two co-founders who ran aged-care facilities for a decade.";
    const echo = buildInputEcho(
      {
        inputKind: "existing_company_text",
        rawText,
        structured: {},
        signals: { ...SIGNALS_BASE, hasCoFounder: true, founderExperience: "experienced", hasRevenue: true, sector: "healthtech" },
        context: { stage: 4 },
      },
      { chars: rawText.length },
    );
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(echo.companyKnown).toBe(true);
    expect(by.company.value).toBe("Kelpie");
    expect(by.company.source).toBe("from your text");
    expect(by.one_liner.value).toContain("rostering app");
    expect(by.sector.value).toBe("HealthTech / MedTech");
    expect(by.stage.value).toBe("Revenue");
    expect(by.revenue.value).toContain("A$18,500");
    expect(by.revenue.source).toBe("from your text");
    expect(by.traction.value).toContain("42 paying customers");
    expect(by.ask.value).toContain("A$1.2M");
    expect(by.team.value).toContain("Team of 4");
    expect(by.team.value).toContain("co-founder team");
    expect(by.team.value).toContain("experienced founder");
    expect(echo.provided).toBe(8); // everything but links and a stated cap
    // Claims carry the numeric sentences.
    expect(echo.claims.length).toBeGreaterThanOrEqual(3);
    expect(echo.claims.every((c) => c.source === "from your text")).toBe(true);
  });

  it("cites slide numbers for a deck and lists the slide titles", () => {
    const slides = [
      "Ferrous\nRecycled steel marketplace for Australian builders",
      "Problem\nBuilders overpay 30% for offcuts",
      "Traction\n1,200 users on the waitlist and 3 pilots signed",
      "The ask\nRaising A$750k seed to launch in Brisbane",
      "Team\nTeam of 3 — ex-BlueScope procurement leads",
    ];
    const echo = buildInputEcho(
      {
        inputKind: "pitch_deck",
        rawText: slides.join("\n\n"),
        structured: { slides, deckSections: { problem: [slides[1]], solution: [], market: [], product: [], traction: [slides[2]], team: [slides[4]], ask: [slides[3]], other: [] } },
        signals: SIGNALS_BASE,
        context: { stage: 1 },
      },
      { filename: "ferrous-deck.pdf" },
    );
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(by.one_liner.source).toBe("from slide 1");
    expect(by.traction.value).toContain("1,200 users");
    expect(by.traction.source).toBe("from slide 3");
    expect(by.ask.source).toBe("from slide 4");
    expect(by.team.source).toBe("from slide 5");
    expect(echo.slideTitles.map((s) => s.title)).toEqual(["Ferrous", "Problem", "Traction", "The ask", "Team"]);
    expect(echo.claims.find((c) => c.text.includes("30%"))?.source).toBe("from slide 2");
  });

  it("cites the page URL for a website and reads the description as the one-liner", () => {
    const url = "https://example.com.au";
    const rawText = "Example Co — Payroll for tradies\n\nExample Co runs payroll for 500 trade businesses across NSW.\n\nBody text here with 500 customers on board.";
    const echo = buildInputEcho(
      {
        inputKind: "website",
        rawText,
        structured: { pages: [{ url, text: "Body text here with 500 customers on board." }] },
        signals: { ...SIGNALS_BASE, hasRevenue: true },
      },
      { url },
    );
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(by.company.value).toBe("Example Co");
    expect(by.company.source).toBe("from the page title");
    expect(by.one_liner.value).toContain("runs payroll");
    expect(by.one_liner.source).toBe(`from ${url}`);
    expect(by.traction.source).toBe(`from ${url}`);
    expect(echo.urls).toEqual([url]);
    expect(by.urls.value).toBe(url);
    // Revenue flagged but no figure → honest wording, never a number.
    expect(by.revenue.value).toBe("Revenue mentioned, no figure given");
  });

  it("reads period revenue, the ask, the SAFE cap and paid pilots from the 2026-09-15 live input", () => {
    const rawText =
      "Brisbane agri-robotics pre-seed, 3 founders. Traction: 2 paid pilots (A$18,000 each), 14 orchards waitlist, LOIs from 2 co-ops. " +
      "Revenue: A$36,000 in the last 6 months. Raising A$1.2M seed on a SAFE at A$6M cap.";
    const echo = buildInputEcho({ inputKind: "existing_company_text", rawText, structured: {}, signals: { ...SIGNALS_BASE, hasRevenue: true }, context: { stage: 3 } });
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(by.stage.value).toBe("Early Traction");
    expect(by.revenue.value).toContain("A$36,000 in the last 6 months");
    expect(by.revenue.value).toContain("read as MRR A$6,000 over 6 months (ARR A$72,000 annualised)");
    expect(by.revenue.source).toBe("from your text");
    expect(by.ask.value).toContain("Raising A$1.2M");
    expect(by.ask.value).toContain("→ A$1.2M");
    expect(by.cap.value).toContain("A$6M cap");
    expect(by.cap.value).toContain("→ cap A$6M");
    expect(by.cap.source).toBe("from your text");
    expect(by.traction.value).toContain("2 paid pilots");
    // The pilots' A$18,000 is never the revenue reading.
    expect(by.revenue.value).not.toContain("A$18,000");
  });

  it("reads Vietnamese revenue / ask / định giá into the same rows", () => {
    const rawText = "Doanh thu: 36.000 AUD trong 6 tháng qua. Gọi vốn 1,2 triệu AUD, định giá 6 triệu AUD.";
    const echo = buildInputEcho({ inputKind: "idea_text", rawText, structured: {}, signals: SIGNALS_BASE });
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(by.revenue.value).toContain("MRR A$6,000");
    expect(by.ask.value).toContain("A$1.2M");
    expect(by.cap.value).toContain("valuation A$6M");
  });

  it("shows paid pilots as traction, not revenue, when no revenue figure is given", () => {
    const rawText = "We have 2 paid pilots (A$18,000 each) with regional councils.";
    const echo = buildInputEcho({ inputKind: "idea_text", rawText, structured: {}, signals: SIGNALS_BASE });
    const by = Object.fromEntries(echo.rows.map((r) => [r.key, r]));
    expect(by.revenue.value).toContain("paid pilots count as traction, not recurring revenue");
    expect(by.cap.value).toBeNull();
  });

  it("marks a stated pre-revenue position as provided, not missing", () => {
    const echo = buildInputEcho({
      inputKind: "idea_text",
      rawText: "We are pre-revenue and building a prototype for dog groomers.",
      structured: {},
      signals: SIGNALS_BASE,
    });
    const rev = echo.rows.find((r) => r.key === "revenue")!;
    expect(rev.value).toBe("Pre-revenue (stated)");
  });

  it("never throws on garbage", () => {
    expect(() => buildInputEcho({ rawText: null, structured: null, signals: null })).not.toThrow();
    expect(() => buildInputEcho({ rawText: "  $$$$ 99999", structured: { slides: [""] } })).not.toThrow();
  });
});

describe("echoToPromptBlock", () => {
  it("writes 'not provided' for missing rows and never invents a value", () => {
    const echo = buildInputEcho({ inputKind: "idea_text", rawText: "An app for florists.", structured: {}, signals: SIGNALS_BASE });
    const block = echoToPromptBlock(echo);
    expect(block).toContain("Revenue: not provided");
    expect(block).toContain("The ask: not provided");
    expect(block).not.toMatch(/A\$\d/);
  });
});

describe("helpers", () => {
  it("extractUrls dedupes, strips trailing punctuation and puts the given URL first", () => {
    const urls = extractUrls("See https://a.com/x, and www.b.com. Also https://a.com/x", "https://given.au");
    expect(urls).toEqual(["https://given.au", "https://a.com/x", "www.b.com"]);
  });

  it("locateSource falls back to 'from your text'", () => {
    expect(locateSource("nothing", { slides: ["one", "two"] })).toBe("from your text");
    expect(locateSource("two", { slides: ["one", "two"] })).toBe("from slide 2");
  });
});
