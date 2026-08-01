// Colocated vitest for the pure-sync surface of `ai-image-client.ts` — the
// multi-provider report-image generator. The module also ships three async
// fetch-backed providers (Gemini / OpenRouter / OpenAI) that need env keys and
// live HTTP — those are intentionally *not* covered here; this suite pins the
// deterministic pieces the report pipeline reaches for every render:
//
//   - `generateMermaidOrgChart(data)` — CEO-rooted `graph TD` from `roles[]`
//   - `generateMermaidTimeline(milestones)` — capped `gantt` schedule
//   - `generateMermaidFlowDiagram(steps)` — chained `graph LR` boxes
//   - `SECTION_IMAGE_PROMPTS`             — per-section prompt + mermaidType
//                                            hint the async orchestrator reads
//   - `getAvailableImageProviders()`      — env-var driven capability list
//
// Together these functions decide *which* provider path `generateSectionImage`
// walks (mermaid short-circuit vs AI provider chain), so drifting their
// outputs silently changes the report's visual mix for every founder.
//
// `server-only` is aliased to `src/test/server-only-shim.ts` in
// `vitest.config.ts`, so importing the module here does not throw.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateMermaidOrgChart,
  generateMermaidTimeline,
  generateMermaidFlowDiagram,
  SECTION_IMAGE_PROMPTS,
  getAvailableImageProviders,
} from "./ai-image-client";

describe("generateMermaidOrgChart", () => {
  it("falls back to the CEO/CTO/CFO/COO default when `roles` is missing", () => {
    // The caller in `generateSectionImage` may pass `context.sectionData` as
    // `undefined`, which the wrapper unwraps to `{}`. The helper must degrade
    // to a sensible default so the report still ships an org chart.
    const out = generateMermaidOrgChart({});
    expect(out).toContain("graph TD");
    expect(out).toContain('CEO["CEO"]');
    expect(out).toContain('CEO --> R1["CTO"]');
    expect(out).toContain('CEO --> R2["CFO"]');
    expect(out).toContain('CEO --> R3["COO"]');
  });

  it("uses the caller-supplied roles verbatim (first role becomes the CEO node label)", () => {
    const out = generateMermaidOrgChart({ roles: ["Founder", "Head of AI", "Head of GTM"] });
    expect(out).toContain('CEO["Founder"]');
    expect(out).toContain('CEO --> R1["Head of AI"]');
    expect(out).toContain('CEO --> R2["Head of GTM"]');
    // No stray R0/R3 rows leak in.
    expect(out).not.toContain("R0");
    expect(out).not.toContain("R3");
  });

  it("renders a solo-founder chart with no reporting arrows", () => {
    const out = generateMermaidOrgChart({ roles: ["Solo Founder"] });
    expect(out).toContain('CEO["Solo Founder"]');
    expect(out).not.toContain("-->");
  });

  it("emits only the `graph TD` header when roles is an empty array", () => {
    // Guard against a future edit that treats `roles: []` as "use defaults" —
    // the current contract is: an explicit empty array means "no org yet".
    const out = generateMermaidOrgChart({ roles: [] });
    expect(out).toBe("graph TD\n");
  });

  it("scales the arrow list linearly with the number of roles supplied", () => {
    const roles = ["CEO", "A", "B", "C", "D", "E", "F", "G"]; // 1 CEO + 7 reports
    const out = generateMermaidOrgChart({ roles });
    const arrows = out.split("\n").filter((l) => l.includes("-->"));
    expect(arrows).toHaveLength(roles.length - 1);
    expect(out).toContain('CEO --> R7["G"]');
  });

  it("passes role labels through untouched (no escaping / truncation)", () => {
    // The helper does not sanitise — special characters land verbatim inside
    // the Mermaid label. If a future edit adds escaping this pin surfaces it.
    const out = generateMermaidOrgChart({ roles: ["CEO & Co-founder", "VP Eng (interim)"] });
    expect(out).toContain('CEO["CEO & Co-founder"]');
    expect(out).toContain('CEO --> R1["VP Eng (interim)"]');
  });
});

describe("generateMermaidTimeline", () => {
  it("emits the gantt header and Product Roadmap title even with no milestones", () => {
    const out = generateMermaidTimeline([]);
    expect(out).toContain("gantt");
    expect(out).toContain("title Product Roadmap");
    expect(out).toContain("dateFormat YYYY-MM-DD");
    expect(out).toContain("section Milestones");
    // No milestone rows.
    expect(out).not.toMatch(/:m\d+,/);
  });

  it("emits one gantt row per milestone with :m{i} anchors and 30d spans", () => {
    const out = generateMermaidTimeline(["Alpha", "Beta", "GA"]);
    expect(out).toContain(":m0,");
    expect(out).toContain(":m1,");
    expect(out).toContain(":m2,");
    // Every row ends with the fixed 30d duration.
    const rows = out.split("\n").filter((l) => l.includes(":m"));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatch(/, 30d$/);
  });

  it("caps the timeline at 8 milestones even when more are supplied", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Milestone ${i}`);
    const out = generateMermaidTimeline(many);
    const rows = out.split("\n").filter((l) => l.includes(":m"));
    expect(rows).toHaveLength(8);
    expect(out).toContain(":m7,");
    expect(out).not.toContain(":m8,");
  });

  it("truncates each milestone label to 40 characters", () => {
    // Long labels break Mermaid layout; the helper trims defensively.
    const long = "A".repeat(80);
    const out = generateMermaidTimeline([long]);
    // Match the 40-char label followed by ` :m0,` — the row header.
    expect(out).toContain(`${"A".repeat(40)} :m0,`);
    expect(out).not.toContain("A".repeat(41));
  });

  it("uses ISO YYYY-MM-DD dates and spaces successive milestones 30 days apart", () => {
    const out = generateMermaidTimeline(["First", "Second", "Third"]);
    const isoDates = [...out.matchAll(/, (\d{4}-\d{2}-\d{2}), 30d/g)].map((m) => m[1]);
    expect(isoDates).toHaveLength(3);
    for (const iso of isoDates) expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [d0, d1, d2] = isoDates.map((s) => Date.parse(`${s}T00:00:00Z`));
    // 30 days apart, ±1 day of slop for DST/TZ edge cases in Date.parse().
    const day = 24 * 60 * 60 * 1000;
    expect(Math.round((d1 - d0) / day)).toBe(30);
    expect(Math.round((d2 - d1) / day)).toBe(30);
  });

  it("uses the milestone string as-is for labels shorter than 40 characters", () => {
    const out = generateMermaidTimeline(["Ship v1"]);
    expect(out).toContain("Ship v1 :m0,");
  });
});

describe("generateMermaidFlowDiagram", () => {
  it("emits the `graph LR` header with no nodes when steps is empty", () => {
    expect(generateMermaidFlowDiagram([])).toBe("graph LR\n");
  });

  it("renders a single step with no arrows", () => {
    const out = generateMermaidFlowDiagram(["Kick off"]);
    expect(out).toContain("graph LR");
    expect(out).toContain('S0["Kick off"]');
    expect(out).not.toContain("-->");
  });

  it("chains steps sequentially with S{i-1} --> S{i} arrows", () => {
    const out = generateMermaidFlowDiagram(["Plan", "Build", "Ship"]);
    expect(out).toContain('S0["Plan"]');
    expect(out).toContain('S1["Build"]');
    expect(out).toContain('S2["Ship"]');
    expect(out).toContain("S0 --> S1");
    expect(out).toContain("S1 --> S2");
    // No accidental cross-links.
    expect(out).not.toContain("S0 --> S2");
    expect(out).not.toContain("S2 --> S0");
  });

  it("truncates each step label to 30 characters", () => {
    const long = "B".repeat(100);
    const out = generateMermaidFlowDiagram([long]);
    expect(out).toContain(`S0["${"B".repeat(30)}"]`);
    expect(out).not.toContain("B".repeat(31));
  });

  it("scales the arrow count as (steps - 1)", () => {
    const steps = Array.from({ length: 6 }, (_, i) => `Step ${i}`);
    const out = generateMermaidFlowDiagram(steps);
    const arrows = out.split("\n").filter((l) => /S\d+ --> S\d+/.test(l));
    expect(arrows).toHaveLength(steps.length - 1);
  });
});

describe("SECTION_IMAGE_PROMPTS", () => {
  it("exposes every section id the report pipeline currently generates images for", () => {
    // If a section is removed from the report or added to the pipeline this
    // list drifts; keeping it pinned surfaces the drift in the same PR.
    const expected = [
      "executive",
      "market",
      "founder",
      "code",
      "website",
      "customers",
      "gtm",
      "revenue",
      "org",
      "roadmap",
      "risk",
      "competitive",
      "action_plan",
    ];
    for (const key of expected) expect(SECTION_IMAGE_PROMPTS[key]).toBeDefined();
  });

  it("routes the three purely-structural sections through Mermaid rendering", () => {
    // These three sections short-circuit the AI provider chain in
    // `generateSectionImage`. Losing the `mermaidType` hint here silently
    // burns paid API quota on every report render.
    expect(SECTION_IMAGE_PROMPTS.org?.mermaidType).toBe("org_chart");
    expect(SECTION_IMAGE_PROMPTS.roadmap?.mermaidType).toBe("timeline");
    expect(SECTION_IMAGE_PROMPTS.action_plan?.mermaidType).toBe("flow");
    // And their `prompt` is intentionally blank — Mermaid needs no natural
    // language prompt.
    expect(SECTION_IMAGE_PROMPTS.org?.prompt).toBe("");
    expect(SECTION_IMAGE_PROMPTS.roadmap?.prompt).toBe("");
    expect(SECTION_IMAGE_PROMPTS.action_plan?.prompt).toBe("");
  });

  it("does NOT set a mermaidType on the AI-generated sections", () => {
    // These sections must reach the AI provider chain; if a future edit adds
    // a mermaidType to any of them the Mermaid short-circuit hijacks the
    // render and produces a wrong visual.
    for (const key of ["executive", "market", "founder", "code", "website", "customers", "gtm", "revenue", "risk", "competitive"]) {
      expect(SECTION_IMAGE_PROMPTS[key]?.mermaidType).toBeUndefined();
    }
  });

  it("ships a non-empty prompt for every non-Mermaid section", () => {
    for (const [key, entry] of Object.entries(SECTION_IMAGE_PROMPTS)) {
      if (entry.mermaidType) continue;
      expect(entry.prompt.length, `section ${key}`).toBeGreaterThan(0);
    }
  });

  it("uses one of the four supported style tokens for every entry", () => {
    // `getStyleGuide` in the same module has a switch on these tokens; an
    // unknown style silently drops the report to the generic default guide.
    const allowed = new Set(["infographic", "chart", "diagram", "illustration", "photo_realistic"]);
    for (const [key, entry] of Object.entries(SECTION_IMAGE_PROMPTS)) {
      expect(allowed.has(entry.style as string), `section ${key} style=${entry.style}`).toBe(true);
    }
  });

  it("returns undefined for unknown section ids so the async caller can skip cleanly", () => {
    // `generateSectionImage` early-returns `null` on lookup miss; the miss
    // must be `undefined` (not a defaulted object) for that path to trigger.
    expect((SECTION_IMAGE_PROMPTS as Record<string, unknown>).not_a_section).toBeUndefined();
  });
});

describe("getAvailableImageProviders", () => {
  // The helper reads process.env at call time, so save/restore the three
  // keys around each test to keep suite ordering irrelevant.
  const KEYS = ["GOOGLE_GEMINI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"] as const;
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("always advertises the two local providers (mermaid + svg) — they need no env keys", () => {
    const providers = getAvailableImageProviders();
    expect(providers).toContain("mermaid");
    expect(providers).toContain("svg");
  });

  it("returns exactly [mermaid, svg] when no provider env keys are set", () => {
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg"]);
  });

  it("adds gemini when GOOGLE_GEMINI_API_KEY is set", () => {
    process.env.GOOGLE_GEMINI_API_KEY = "test-key";
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg", "gemini"]);
  });

  it("adds openrouter when OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg", "openrouter"]);
  });

  it("adds openai when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "test-key";
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg", "openai"]);
  });

  it("adds providers in the pinned order gemini → openrouter → openai when all three keys are set", () => {
    // The order matches the priority chain the async provider walker uses;
    // reordering here would ship a mismatched capability advertisement.
    process.env.GOOGLE_GEMINI_API_KEY = "g";
    process.env.OPENROUTER_API_KEY = "o";
    process.env.OPENAI_API_KEY = "p";
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg", "gemini", "openrouter", "openai"]);
  });

  it("treats an empty-string env key as absent (falsy check, not `in`)", () => {
    // The helper uses `if (process.env.X)` rather than `if ("X" in process.env)`
    // — an empty value must not enable the provider or the async chain throws
    // "API key not configured".
    process.env.GOOGLE_GEMINI_API_KEY = "";
    process.env.OPENROUTER_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    expect(getAvailableImageProviders()).toEqual(["mermaid", "svg"]);
  });
});
