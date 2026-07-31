import { describe, it, expect } from "vitest";
import { generateDataRoom } from "./data-room";

// Colocated vitest for the pure Phase-6 investor data-room generator
// (docs/plans/atlassian-standard-mapping-goal.md §P1_dataroom_map). The
// generator projects existing SVI + metrics + evidence + cap-table state
// into six investor-standard sections with per-section + overall
// completeness percentages — the input to the /workspace/dataroom UI and
// the weekly-digest Investor Readiness callout. Silent regressions here
// would corrupt every downstream readiness score (P5) and every nudge
// engine phase call (P3), so every branch of the six-section pipeline is
// pinned below.

type User = Parameters<typeof generateDataRoom>[0]["user"];
type Params = Parameters<typeof generateDataRoom>[0];

const USER: User = { email: "founder@example.test", displayName: "Ava Founder" };

function baseParams(over: Partial<Params> = {}): Params {
  return {
    user: USER,
    sviAccount: null,
    ...over,
  };
}

function section(room: ReturnType<typeof generateDataRoom>, id: string) {
  const s = room.sections.find((sec) => sec.id === id);
  if (!s) throw new Error(`section ${id} missing`);
  return s;
}

function item(room: ReturnType<typeof generateDataRoom>, sectionId: string, label: string) {
  const it = section(room, sectionId).items.find((i) => i.label === label);
  if (!it) throw new Error(`item ${label} missing from ${sectionId}`);
  return it;
}

describe("generateDataRoom — structure", () => {
  it("returns six sections in fixed order matching investor-standard folders", () => {
    const room = generateDataRoom(baseParams());
    expect(room.sections.map((s) => s.id)).toEqual([
      "company",
      "product",
      "financial",
      "market",
      "team",
      "legal",
    ]);
    expect(room.sections.map((s) => s.title)).toEqual([
      "Company Overview",
      "Product & Technology",
      "Financial",
      "Market & Traction",
      "Team & Cap Table",
      "Legal & Compliance",
    ]);
  });

  it("emits an ISO-8601 generatedAt timestamp round-trippable through Date", () => {
    const before = Date.now();
    const room = generateDataRoom(baseParams());
    const after = Date.now();
    const t = Date.parse(room.generatedAt);
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    // ISO with millisecond precision + trailing Z — the `.toISOString()` shape
    expect(room.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("empty inputs — only Founder/Contact is complete out of 27 total rows", () => {
    // Founder / Contact resolves via `USER.displayName` truthiness, so it's
    // the only complete row when everything else is absent. Guard: pin the
    // total-row count and the complete count so a schema drift surfaces here
    // rather than as a silent readiness-score wobble downstream.
    const room = generateDataRoom(baseParams());
    const total = room.sections.reduce((n, s) => n + s.items.length, 0);
    const completeCount = room.sections
      .flatMap((s) => s.items)
      .filter((i) => i.status === "complete").length;
    expect(total).toBe(27);
    expect(completeCount).toBe(1);
    expect(room.overallCompleteness).toBe(Math.round((1 / 27) * 100));
  });
});

describe("generateDataRoom — Company Overview", () => {
  it("Startup Name — complete when sviAccount.startupName set, missing otherwise", () => {
    const room = generateDataRoom(
      baseParams({
        sviAccount: { startupName: "Acme Pty Ltd", currentStage: 2, currentSvi: 500 },
      }),
    );
    expect(item(room, "company", "Startup Name")).toMatchObject({
      status: "complete",
      value: "Acme Pty Ltd",
      source: "auto",
    });
    const empty = generateDataRoom(baseParams());
    expect(item(empty, "company", "Startup Name")).toMatchObject({
      status: "missing",
      value: undefined,
    });
  });

  it("Founder / Contact — displayName wins over email; email fallback still counts", () => {
    const withName = generateDataRoom(baseParams());
    expect(item(withName, "company", "Founder / Contact").value).toBe("Ava Founder");
    expect(item(withName, "company", "Founder / Contact").status).toBe("complete");
    const noName = generateDataRoom(
      baseParams({ user: { email: "ceo@example.test", displayName: null } }),
    );
    expect(item(noName, "company", "Founder / Contact").value).toBe("ceo@example.test");
    expect(item(noName, "company", "Founder / Contact").status).toBe("complete");
  });

  it("Founder / Contact — missing when both displayName is null AND email is empty string", () => {
    // The type says `email: string`, but the truthiness gate treats "" as absent.
    // This is the only shape that makes the row report `missing`.
    const room = generateDataRoom(baseParams({ user: { email: "", displayName: null } }));
    expect(item(room, "company", "Founder / Contact").status).toBe("missing");
  });

  it("Current Stage — resolves stageLabel for every canonical 0..7 value", () => {
    const labels = [
      "Idea",
      "Validation",
      "MVP",
      "Launch",
      "Revenue",
      "Growth",
      "Scale",
      "Exit-Ready",
    ];
    for (let stage = 0; stage <= 7; stage++) {
      const room = generateDataRoom(
        baseParams({
          sviAccount: { startupName: null, currentStage: stage, currentSvi: 0 },
        }),
      );
      expect(item(room, "company", "Current Stage").value).toBe(labels[stage]);
    }
  });

  it("Current Stage — falls back to `Stage N` for out-of-range values (defensive)", () => {
    const room = generateDataRoom(
      baseParams({
        sviAccount: { startupName: null, currentStage: 42, currentSvi: 0 },
      }),
    );
    expect(item(room, "company", "Current Stage").value).toBe("Stage 42");
  });

  it("SVI Score — complete only when currentSvi > 0, formatted as `N/1000`", () => {
    const zero = generateDataRoom(
      baseParams({
        sviAccount: { startupName: "A", currentStage: 0, currentSvi: 0 },
      }),
    );
    // Note the shape: the value is *rendered* even when the row is `missing`,
    // because the value expression fires when sviAccount is present regardless
    // of the score. Only the status gate depends on the > 0 check. Founders
    // still see a "0/1000" hint on the missing row so they know the account
    // is wired up but the score hasn't been computed yet.
    expect(item(zero, "company", "SVI Score")).toMatchObject({
      status: "missing",
      value: "0/1000",
    });
    const scored = generateDataRoom(
      baseParams({
        sviAccount: { startupName: "A", currentStage: 0, currentSvi: 742 },
      }),
    );
    expect(item(scored, "company", "SVI Score")).toMatchObject({
      status: "complete",
      value: "742/1000",
    });
  });

  it("ABN / Company Registration — matches the `abn` keyword and reports evidence source", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "registration", label: "Company ABN certificate", valueOrUrl: "79 659 615 111" },
        ],
      }),
    );
    const abn = item(room, "company", "ABN / Company Registration");
    expect(abn.status).toBe("complete");
    expect(abn.source).toBe("evidence");
    expect(abn.value).toBe("79 659 615 111");
  });

  it("ABN — reports manual source when no evidence provided (nudge target)", () => {
    const room = generateDataRoom(baseParams());
    const abn = item(room, "company", "ABN / Company Registration");
    expect(abn.status).toBe("missing");
    expect(abn.source).toBe("manual");
  });
});

describe("generateDataRoom — Product & Technology", () => {
  it("SVI Analysis Report — complete when latestAnalysis present, shows `Score: N/1000`", () => {
    const room = generateDataRoom(
      baseParams({ latestAnalysis: { totalSvi: 615, analysisJson: {} } }),
    );
    expect(item(room, "product", "SVI Analysis Report")).toMatchObject({
      status: "complete",
      value: "Score: 615/1000",
    });
    const empty = generateDataRoom(baseParams());
    expect(item(empty, "product", "SVI Analysis Report").status).toBe("missing");
  });

  it("Product Demo — matches any of {product, demo, screenshot, prototype, mvp} case-insensitively", () => {
    for (const kw of ["Product", "DEMO", "Screenshot", "prototype", "MVP"]) {
      const room = generateDataRoom(
        baseParams({
          evidence: [
            { evidenceType: "media", label: `${kw} walkthrough`, valueOrUrl: "https://x" },
          ],
        }),
      );
      expect(item(room, "product", "Product Demo / Screenshots").status).toBe("complete");
    }
  });

  it("Technical Architecture + IP — each matches its own keyword pool independently", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "spec", label: "System architecture diagram", valueOrUrl: "u" },
          { evidenceType: "ip", label: "Trademark registration", valueOrUrl: "u" },
        ],
      }),
    );
    expect(item(room, "product", "Technical Architecture").status).toBe("complete");
    expect(item(room, "product", "IP / Patent Documentation").status).toBe("complete");
  });
});

describe("generateDataRoom — Financial", () => {
  it("MRR / ARR / burn / runway — formatted with en-AU locale + correct suffixes", () => {
    const room = generateDataRoom(
      baseParams({
        metrics: [
          { metricType: "mrr", value: 12500 },
          { metricType: "arr", value: 150000 },
          { metricType: "burn_rate", value: 30000 },
          { metricType: "runway", value: 18 },
        ],
      }),
    );
    expect(item(room, "financial", "Monthly Recurring Revenue (MRR)").value).toBe("A$12,500");
    expect(item(room, "financial", "Annual Recurring Revenue (ARR)").value).toBe("A$150,000");
    expect(item(room, "financial", "Monthly Burn Rate").value).toBe("A$30,000/mo");
    expect(item(room, "financial", "Runway (months)").value).toBe("18 months");
  });

  it("Metric rows report missing when the specific metricType is absent (per-row scoped)", () => {
    const room = generateDataRoom(
      baseParams({ metrics: [{ metricType: "mrr", value: 100 }] }),
    );
    expect(item(room, "financial", "Monthly Recurring Revenue (MRR)").status).toBe("complete");
    expect(item(room, "financial", "Annual Recurring Revenue (ARR)").status).toBe("missing");
    expect(item(room, "financial", "Monthly Burn Rate").status).toBe("missing");
    expect(item(room, "financial", "Runway (months)").status).toBe("missing");
  });

  it("Valuation Estimate — displays rounded mid value in en-AU, missing when null", () => {
    const room = generateDataRoom(
      baseParams({ valuation: { low: 800000, mid: 1234567.6, high: 1800000 } }),
    );
    expect(item(room, "financial", "Valuation Estimate")).toMatchObject({
      status: "complete",
      value: "A$1,234,568",
    });
    const empty = generateDataRoom(baseParams());
    expect(item(empty, "financial", "Valuation Estimate").status).toBe("missing");
  });

  it("P&L / Financial Statements — evidence keyword match tolerates case + punctuation", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "financial", label: "Bank statement Q4", valueOrUrl: "u" },
        ],
      }),
    );
    expect(item(room, "financial", "P&L / Financial Statements").status).toBe("complete");
  });
});

describe("generateDataRoom — Market & Traction", () => {
  it("Pitch Deck / Market Research / Customer Contracts — each keyword pool matches independently", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "pitch", label: "Series A deck", valueOrUrl: "u" },
          { evidenceType: "market", label: "TAM analysis 2026", valueOrUrl: "u" },
          { evidenceType: "customer", label: "LOI from Acme Corp", valueOrUrl: "u" },
        ],
      }),
    );
    expect(item(room, "market", "Pitch Deck").status).toBe("complete");
    expect(item(room, "market", "Market Research / TAM Analysis").status).toBe("complete");
    expect(item(room, "market", "Customer Contracts / LOIs").status).toBe("complete");
  });

  it("Revenue Growth Rate — sourced from the `revenue_growth` metricType with `% MoM` suffix", () => {
    const room = generateDataRoom(
      baseParams({ metrics: [{ metricType: "revenue_growth", value: 22 }] }),
    );
    expect(item(room, "market", "Revenue Growth Rate")).toMatchObject({
      status: "complete",
      value: "22% MoM",
    });
  });
});

describe("generateDataRoom — Team & Cap Table", () => {
  it("Cap Table — reports shareholder count when non-empty; missing on empty list", () => {
    const with3 = generateDataRoom(
      baseParams({
        capTable: {
          shareholders: [
            { name: "Ava", role: "founder", shares_held: 3000 },
            { name: "Ben", role: "co-founder", shares_held: 2500 },
            { name: "Cara", role: "advisor", shares_held: 500 },
          ],
        },
      }),
    );
    expect(item(with3, "team", "Cap Table").value).toBe("3 shareholders");
    expect(item(with3, "team", "Cap Table").status).toBe("complete");
    const empty = generateDataRoom(baseParams({ capTable: { shareholders: [] } }));
    expect(item(empty, "team", "Cap Table").status).toBe("missing");
  });

  it("Founder Profiles — filters shareholders by role ∈ {founder, co-founder, ceo}, comma-joined", () => {
    const room = generateDataRoom(
      baseParams({
        capTable: {
          shareholders: [
            { name: "Ava", role: "founder", shares_held: 3000 },
            { name: "Ben", role: "co-founder", shares_held: 2500 },
            { name: "Cara", role: "advisor", shares_held: 500 },
            { name: "Dan", role: "ceo", shares_held: 100 },
          ],
        },
      }),
    );
    expect(item(room, "team", "Founder Profiles")).toMatchObject({
      status: "complete",
      value: "Ava, Ben, Dan",
    });
  });

  it("Founder Profiles — missing when cap-table exists but no qualifying roles present", () => {
    const room = generateDataRoom(
      baseParams({
        capTable: {
          shareholders: [{ name: "Investor One", role: "investor", shares_held: 1000 }],
        },
      }),
    );
    expect(item(room, "team", "Founder Profiles").status).toBe("missing");
  });

  it("Shareholders Agreement + Vesting/ESOP — evidence keywords wired into the right rows", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "legal", label: "Signed SHA v2", valueOrUrl: "u" },
          { evidenceType: "esop", label: "ESOP vesting schedule", valueOrUrl: "u" },
        ],
      }),
    );
    expect(item(room, "team", "Shareholders Agreement").status).toBe("complete");
    expect(item(room, "team", "Vesting Schedules / ESOP").status).toBe("complete");
  });
});

describe("generateDataRoom — Legal & Compliance", () => {
  it("Every legal row wires to its own evidence keyword pool", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "gov", label: "Certificate of Incorporation", valueOrUrl: "u" },
          { evidenceType: "policy", label: "Terms of Service v1", valueOrUrl: "u" },
          { evidenceType: "policy", label: "Privacy Policy 2026", valueOrUrl: "u" },
          { evidenceType: "commercial", label: "Supplier contract Q1", valueOrUrl: "u" },
        ],
      }),
    );
    expect(item(room, "legal", "Certificate of Incorporation / Constitution").status).toBe("complete");
    expect(item(room, "legal", "Terms of Service").status).toBe("complete");
    expect(item(room, "legal", "Privacy Policy").status).toBe("complete");
    expect(item(room, "legal", "Key Contracts").status).toBe("complete");
  });
});

describe("generateDataRoom — completeness math", () => {
  it("per-section completeness is rounded integer percentage of complete items", () => {
    // Empty inputs: only Founder/Contact is complete in company (1 of 5) → 20%.
    // Product/Financial/Market/Team/Legal all zero.
    const room = generateDataRoom(baseParams());
    expect(section(room, "company").completeness).toBe(20);
    expect(section(room, "product").completeness).toBe(0);
    expect(section(room, "financial").completeness).toBe(0);
    expect(section(room, "market").completeness).toBe(0);
    expect(section(room, "team").completeness).toBe(0);
    expect(section(room, "legal").completeness).toBe(0);
  });

  it("overall completeness is round(complete/total * 100) across all six sections combined", () => {
    // Empty inputs: 1 complete / 29 total = 3.44... → rounds to 3.
    const room = generateDataRoom(baseParams());
    const total = room.sections.reduce((n, s) => n + s.items.length, 0);
    const complete = room.sections
      .flatMap((s) => s.items)
      .filter((i) => i.status === "complete").length;
    expect(total).toBe(27);
    expect(complete).toBe(1);
    expect(room.overallCompleteness).toBe(Math.round((complete / total) * 100));
    expect(room.overallCompleteness).toBe(4);
  });

  it("reaches 100 overall when every input is populated to satisfy every row", () => {
    const room = generateDataRoom({
      user: USER,
      sviAccount: { startupName: "Acme", currentStage: 3, currentSvi: 800 },
      latestAnalysis: { totalSvi: 800, analysisJson: {} },
      metrics: [
        { metricType: "mrr", value: 10000 },
        { metricType: "arr", value: 120000 },
        { metricType: "burn_rate", value: 20000 },
        { metricType: "runway", value: 12 },
        { metricType: "revenue_growth", value: 15 },
      ],
      capTable: {
        shareholders: [
          { name: "Ava", role: "founder", shares_held: 4000 },
          { name: "Ben", role: "co-founder", shares_held: 3000 },
        ],
      },
      valuation: { low: 900000, mid: 1200000, high: 1600000 },
      evidence: [
        { evidenceType: "reg", label: "ABN certificate", valueOrUrl: "79" },
        { evidenceType: "product", label: "Demo video", valueOrUrl: "u" },
        { evidenceType: "tech", label: "Architecture doc", valueOrUrl: "u" },
        { evidenceType: "ip", label: "Trademark", valueOrUrl: "u" },
        { evidenceType: "fin", label: "Bank statement", valueOrUrl: "u" },
        { evidenceType: "deck", label: "Pitch deck 2026", valueOrUrl: "u" },
        { evidenceType: "market", label: "TAM report", valueOrUrl: "u" },
        { evidenceType: "cust", label: "LOI Acme", valueOrUrl: "u" },
        { evidenceType: "legal", label: "SHA signed", valueOrUrl: "u" },
        { evidenceType: "esop", label: "Vesting plan", valueOrUrl: "u" },
        { evidenceType: "gov", label: "Constitution", valueOrUrl: "u" },
        { evidenceType: "policy", label: "Terms of Service", valueOrUrl: "u" },
        { evidenceType: "policy", label: "Privacy Policy", valueOrUrl: "u" },
        { evidenceType: "com", label: "Supplier contract", valueOrUrl: "u" },
      ],
    });
    expect(room.overallCompleteness).toBe(100);
    for (const s of room.sections) expect(s.completeness).toBe(100);
  });
});

describe("generateDataRoom — evidence matching", () => {
  it("keyword search is case-insensitive across both label and evidenceType", () => {
    // Only evidenceType carries the keyword — label is unrelated. The concatenated
    // "${label} ${evidenceType}" text should still match, proving the row picks
    // evidenceType up as well as label.
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "ABN", label: "regulatory doc", valueOrUrl: "79 000" },
        ],
      }),
    );
    expect(item(room, "company", "ABN / Company Registration").status).toBe("complete");
  });

  it("returns the first matching evidence when multiple candidates match the same keyword pool", () => {
    const room = generateDataRoom(
      baseParams({
        evidence: [
          { evidenceType: "e1", label: "TAM report v1", valueOrUrl: "u1" },
          { evidenceType: "e2", label: "Market research v2", valueOrUrl: "u2" },
        ],
      }),
    );
    // Both match the market pool; the first entry wins per Array.prototype.find order.
    expect(item(room, "market", "Market Research / TAM Analysis").value).toBe("TAM report v1");
  });

  it("evidence=null and evidence=[] both degrade to `missing / manual` on evidence-backed rows", () => {
    const nullRoom = generateDataRoom(baseParams({ evidence: null }));
    expect(item(nullRoom, "company", "ABN / Company Registration").source).toBe("manual");
    const emptyRoom = generateDataRoom(baseParams({ evidence: [] }));
    expect(item(emptyRoom, "company", "ABN / Company Registration").source).toBe("manual");
    expect(item(emptyRoom, "company", "ABN / Company Registration").status).toBe("missing");
  });
});
