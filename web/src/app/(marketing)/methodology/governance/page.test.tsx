// Colocated test for /methodology/governance + /vi/methodology/governance
// (G21 P0-D). Pins: the section list equals the `## N. Title` headings of
// docs/product/score-governance.md (the institutional document and the
// public page cannot drift), SVI_VERSION_HISTORY ends on the live constant
// and matches the document's table, every figure comes from the engine
// constants, the human-in-the-loop line is verbatim, no weights, no PhD,
// no "predict"; /methodology now shows the version line + governance link
// + the human-in-the-loop paragraph.

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { CONFIDENCE_LEVELS } from "@/lib/evidence/confidence-cap";
import { DIMENSION_OWNERS, DIM_LEGACY_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { EVIDENCE_CONFIDENCE, SVI_VERSION } from "@/lib/svi-analysis";
import { BENCHMARK_N_RULES } from "@/lib/svi/benchmark-rules";
import { buildMethodologyProps } from "../methodology-content";
import MethodologyRoute from "../page";
import { HUMAN_IN_THE_LOOP, SVI_VERSION_HISTORY, buildGovernanceProps, buildGovernanceSections } from "./governance-content";
import { GOVERNANCE_CHROME } from "./governance-body";
import GovernanceRoute, { generateMetadata } from "./page";
import ViGovernanceRoute from "../../../vi/methodology/governance/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;
const DOC = readFileSync(resolve(__dirname, "../../../../../../docs/product/score-governance.md"), "utf8");

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("governance-content ⇄ docs/product/score-governance.md", () => {
  it("section titles equal the document's `## N. Title` headings, in order", () => {
    const headings = [...DOC.matchAll(/^## (\d+)\. (.+?)\s*$/gm)].map((m) => m[2]);
    expect(headings.length).toBeGreaterThanOrEqual(14);
    expect(buildGovernanceSections().map((s) => s.title)).toEqual(headings);
  });

  it("SVI_VERSION_HISTORY ends on the live SVI_VERSION and every row is in the document's table", () => {
    expect(SVI_VERSION_HISTORY[SVI_VERSION_HISTORY.length - 1].version).toBe(SVI_VERSION);
    for (const h of SVI_VERSION_HISTORY) expect(DOC).toContain(`| ${h.version} | ${h.date} |`);
    const versions = SVI_VERSION_HISTORY.map((h) => h.version);
    expect([...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))).toEqual(versions);
  });

  it("the document carries the human-in-the-loop line, the benchmark tiers and the entity-free contact line", () => {
    expect(DOC).toContain(HUMAN_IN_THE_LOOP);
    expect(DOC).toContain("| fewer than 10 |");
    expect(DOC).toContain("| 10 – 29 |");
    expect(DOC).toContain("| 30 – 99 |");
    expect(DOC).toContain("| 100 or more |");
    expect(DOC).not.toMatch(/PhD/);
    expect(DOC).not.toMatch(/\bpredicts?\b/i);
    expect(DOC).not.toMatch(/Founder Institute|course|assignment|advisor feedback/i);
  });

  it("sections carry the engine figures: eight dimension titles, the evidence ladder, the tiers, the version, the support address; no weight values", () => {
    const sections = buildGovernanceSections();
    const dims = sections.find((s) => s.id === "s2")!.table!;
    expect(dims.rows.map((r) => r[1])).toEqual(DIM_LEGACY_ORDER.map((k) => DIMENSION_OWNERS[k].title));
    const ladder = sections.find((s) => s.id === "s4")!.table!;
    expect(ladder.rows.map((r) => r[0])).toEqual([...CONFIDENCE_LEVELS]);
    expect(ladder.rows.map((r) => r[1])).toEqual(CONFIDENCE_LEVELS.map((l) => EVIDENCE_CONFIDENCE[l].toFixed(2)));
    const tiers = sections.find((s) => s.id === "s7")!.table!;
    expect(tiers.rows).toHaveLength(BENCHMARK_N_RULES.length);
    expect(tiers.rows[0][0]).toBe("fewer than 10");
    expect(sections.find((s) => s.id === "s5")!.paragraphs[0]).toContain(SVI_VERSION);
    expect(sections.find((s) => s.id === "s14")!.paragraphs[0]).toContain(LEGAL_ENTITY.supportEmail);
    const text = JSON.stringify(sections);
    for (const key of DIM_LEGACY_ORDER) expect(text).not.toMatch(new RegExp(`${DIMENSION_OWNERS[key].weight}\\s*%`));
    expect(text).not.toContain("weight:");
    expect(buildGovernanceProps().principle).toBe(HUMAN_IN_THE_LOOP);
  });
});

describe("/methodology/governance — rendered", () => {
  it("h1, the principle verbatim, the version line, a 14-entry table of contents, every section heading, the ladder and the tiers", async () => {
    const out = await html(GovernanceRoute());
    const p = buildGovernanceProps();
    expect(out).toContain("<h1");
    expect(out).toContain(esc(p.hero.title));
    expect(out).toContain(`data-testid="governance-principle"`);
    expect(out).toContain(esc(HUMAN_IN_THE_LOOP));
    expect(out).toContain(`Methodology version v${SVI_VERSION}`);
    expect((out.match(/href="#s\d+"/g) ?? []).length).toBe(p.sections.length);
    for (const s of p.sections) expect(out).toContain(esc(s.title));
    for (const level of CONFIDENCE_LEVELS) expect(out).toContain(level);
    for (const r of BENCHMARK_N_RULES) expect(out).toContain(esc(r.shows));
    expect(out).toContain('href="/methodology"');
    expect(out).toContain('href="/showcase/blockid/report"');
    expect(out).not.toMatch(/PhD|doctoral/i);
    expect(out).not.toMatch(/\bpredicts?\b/i);
    expect(out).not.toContain("weight:");
  });

  it("metadata: canonical /methodology/governance with the VI hreflang twin, indexable", async () => {
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("https://blockid.au/methodology/governance");
    expect((meta.alternates?.languages as Record<string, string>).vi).toBe("https://blockid.au/vi/methodology/governance");
    expect(String(meta.description)).toContain(SVI_VERSION);
  });

  it("/vi/methodology/governance renders the translated summary above the same sections and links /vi/methodology", async () => {
    const out = await html(ViGovernanceRoute());
    expect(out).toContain("Quản trị điểm số — tóm tắt");
    expect(out).toContain("Con người ra quyết định");
    expect(out).toContain(esc(HUMAN_IN_THE_LOOP));
    expect(out).toContain('href="/vi/methodology"');
    expect((out.match(/href="#s\d+"/g) ?? []).length).toBe(buildGovernanceSections().length);
  });

  // G22-C — the VI mirror's chrome is Vietnamese: one VI h1, VI eyebrows and
  // section labels, VI version line and closing band; the institutional
  // sections stay English inside a `lang="en"` wrapper with the note.
  it("/vi/methodology/governance: VI h1 + eyebrows + labels + closing band; English document marked lang=en", async () => {
    const out = await html(ViGovernanceRoute());
    const c = GOVERNANCE_CHROME.vi;
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain(c.heroTitle);
    expect(out).not.toContain("Startup Value Index — score governance");
    expect(out).toContain(c.heroEyebrow);
    expect(out).toContain(c.principleEyebrow);
    expect(out).toContain(c.principleTitle);
    expect(out).toContain(`Phiên bản phương pháp v${SVI_VERSION}`);
    expect(out).toContain(c.backToMethodology);
    expect(out).toContain(c.contentsEyebrow);
    expect(out).toContain(c.contentsTitle);
    expect(out).toContain(esc(c.sectionEyebrow(1)));
    expect(out).toContain(c.ctaTitle);
    expect(out).toContain(c.ctaPrimary);
    expect(out).toContain(c.ctaSecondary);
    expect(out).toContain(c.englishSectionNote);
    for (const en of ["Human in the loop", "The one rule every section follows", "back to the methodology", ">Contents<", ">Sections<", "See the methodology the rules govern", "Read the methodology", "See a real report"]) {
      expect(out, en).not.toContain(en);
    }
    expect(out).toMatch(/<div lang="vi">/);
    expect(out).toMatch(/<div lang="en" data-testid="governance-sections">/);
    expect(out).toMatch(/<blockquote lang="en"/);
  });

  it("/methodology/governance (EN) keeps its English chrome — no VI string leaks into the English page", async () => {
    const out = await html(GovernanceRoute());
    const c = GOVERNANCE_CHROME.en;
    expect(out).toContain(c.principleEyebrow);
    expect(out).toContain(c.contentsTitle);
    expect(out).toContain(c.ctaTitle);
    expect(out).not.toContain(GOVERNANCE_CHROME.vi.principleEyebrow);
    expect(out).not.toContain("tiếng Anh");
    expect(out).toMatch(/<div lang="en">/);
  });
});

describe("/methodology — governance row, version line, human-in-the-loop paragraph (G21 P0-D)", () => {
  it("props carry the governance link, the version line and the verbatim institutional line (EN + VI)", () => {
    const enP = buildMethodologyProps(EN, "en");
    expect(enP.governance.href).toBe("/methodology/governance");
    expect(enP.governance.versionLine).toBe(`Methodology version v${SVI_VERSION}`);
    expect(enP.hitl.body).toBe(HUMAN_IN_THE_LOOP);
    const viP = buildMethodologyProps(VI, "vi");
    expect(viP.governance.href).toBe("/vi/methodology/governance");
    expect(viP.governance.versionLine).toContain(`v${SVI_VERSION}`);
    expect(viP.hitl.body.length).toBeGreaterThan(20);
  });

  it("renders the version line, the governance link and the human-in-the-loop blockquote", async () => {
    const out = await html(await MethodologyRoute());
    expect(out).toContain(`data-testid="methodology-version-line"`);
    expect(out).toContain(`Methodology version v${SVI_VERSION}`);
    expect(out).toContain('href="/methodology/governance"');
    expect(out).toContain(`data-testid="methodology-hitl"`);
    expect(out).toContain(esc(HUMAN_IN_THE_LOOP));
  });
});
