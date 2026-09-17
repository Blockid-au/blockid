// Colocated test for /methodology, /vi/methodology and the calibration
// placeholder (G14-S36). Pins: h1, the eight dimension headings straight
// from DIMENSION_OWNERS, the evidence ladder from EVIDENCE_CONFIDENCE, the
// L0–L5 rows, the three version strings, the data-ownership sentence
// verbatim, NO weights on the page (F-3 default) and no "PhD" claim. The
// marketing shell mounts NavV2 → useRouter(), so it is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { CAP_RULES_PLAIN, CONFIDENCE_LEVELS } from "@/lib/evidence/confidence-cap";
import { DIMENSION_OWNERS, DIM_LEGACY_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { PIPELINE_VERSION } from "@/lib/report-pipeline/version";
import { REPORT_V2_SCHEMA_VERSION } from "@/lib/report-v2/schema";
import { CITE_ONLY_SOURCE_IDS, EXTERNAL_SOURCE_CATALOG, INGESTABLE_SOURCE_IDS } from "@/lib/signals/external-sources";
import { EVIDENCE_CONFIDENCE, SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { VERIFICATION_LEVEL_LABELS, VERIFICATION_MULTIPLIER } from "@/lib/verification/confidence-multiplier";
import { buildMethodologyProps, methodologyDimensions } from "./methodology-content";
import MethodologyRoute, { generateMetadata } from "./page";
import ViMethodologyRoute from "../../vi/methodology/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("buildMethodologyProps — every figure comes from the engine modules", () => {
  it("eight dimensions in legacy order, titles === DIMENSION_OWNERS[*].title, owner = primary agent, criteria titles, no weight field", () => {
    const dims = methodologyDimensions("en");
    expect(dims.map((d) => d.key)).toEqual([...DIM_LEGACY_ORDER]);
    for (const d of dims) {
      expect(d.title).toBe(DIMENSION_OWNERS[d.key].title);
      expect(d.owner).toBe(DIMENSION_OWNERS[d.key].primary.toUpperCase());
      expect(d.criteria.length).toBeGreaterThan(0);
      expect(d).not.toHaveProperty("weight");
    }
    expect(methodologyDimensions("vi").map((d) => d.title)).toEqual(DIM_LEGACY_ORDER.map((k) => DIMENSION_OWNERS[k].titleVi));
  });

  it("ladder rows mirror EVIDENCE_CONFIDENCE; cap rows carry the confidence-cap ceilings; L0–L5 carry the F-6 multipliers", () => {
    const p = buildMethodologyProps(EN, "en");
    expect(p.ladder.rows.map((r) => r.level)).toEqual([...CONFIDENCE_LEVELS]);
    for (const r of p.ladder.rows) expect(r.confidencePct).toBe(Math.round(EVIDENCE_CONFIDENCE[r.level] * 100));
    const caps = new Map(CAP_RULES_PLAIN.map((r) => [r.origin, r]));
    for (const r of p.caps.rows) {
      expect(r.ceiling).toBe(caps.get(r.origin)?.ceiling);
      expect(r.rule).toBe(caps.get(r.origin)?.rule); // EN catalogue text === the module's plain rules
    }
    expect(p.verification.rows.map((r) => r.multiplier)).toEqual([0, 1, 2, 3, 4, 5].map((l) => VERIFICATION_MULTIPLIER[l as 0]));
    expect(p.verification.multiplierNote).toContain("×0.85");
    expect(p.verification.multiplierNote).toContain("×1.10");
    expect(p.versioning.rows.map((r) => r.value)).toEqual([`SVI ${SVI_VERSION}`, `ReportV2 ${REPORT_V2_SCHEMA_VERSION}`, PIPELINE_VERSION]);
    expect(p.data.sentence).toBe(DATA_PRINCIPLE_SENTENCE);
    expect(p.calibration.href).toBe("/methodology/calibration");
  });

  it("S40 data sources: the code catalogue by default (fromDb=false), attribution verbatim, cite-only rows labelled; live rows replace it", () => {
    const p = buildMethodologyProps(EN, "en");
    expect(p.sources.fromDb).toBe(false);
    expect(p.sources.items.map((s) => s.id)).toEqual(EXTERNAL_SOURCE_CATALOG.map((s) => s.id));
    for (const s of p.sources.items) {
      const c = EXTERNAL_SOURCE_CATALOG.find((x) => x.id === s.id)!;
      expect(s.attribution).toBe(c.attribution_text);
      expect(s.licence).toBe(c.licence);
      expect(s.citeOnly).toBe(c.status === "cite_only");
      expect(s.useLabel).toBe(EN[`methodology.sources.use.${c.status}`]);
    }
    expect(p.sources.items.filter((s) => !s.citeOnly).map((s) => s.id)).toEqual([...INGESTABLE_SOURCE_IDS]);
    expect(p.sources.items.filter((s) => s.citeOnly).map((s) => s.id)).toEqual([...CITE_ONLY_SOURCE_IDS]);
    const live = buildMethodologyProps(EN, "en", { sources: { fromDb: true, rows: [{ ...EXTERNAL_SOURCE_CATALOG[0], row_count: 1234, last_fetched_at: "2026-09-13T03:00:00.000Z" }] } });
    expect(live.sources.fromDb).toBe(true);
    expect(live.sources.items).toHaveLength(1);
    expect(live.sources.items[0]).toMatchObject({ id: "abr-bulk", rowCount: 1234, lastFetchedAt: "2026-09-13T03:00:00.000Z" });
  });
});

describe("/methodology — rendered page", () => {
  it("h1 + the eight engine dimension headings + ladder + L0–L5 + versions + data sentence verbatim; no weights, no PhD", async () => {
    const out = await html(await MethodologyRoute());
    expect(out).toContain("<h1");
    expect(out).toContain(esc(EN["methodology.title"]));
    for (const key of DIM_LEGACY_ORDER) {
      expect(out).toContain(`<h3 class="text-base font-semibold text-primary">${esc(DIMENSION_OWNERS[key].title)}</h3>`);
    }
    expect((out.match(/id="dim-[a-z]{3}"/g) ?? []).length).toBe(8);
    for (const level of CONFIDENCE_LEVELS) expect(out).toContain(`>${level}</code>`);
    for (const l of [0, 1, 2, 3, 4, 5] as const) {
      expect(out).toContain(`>L${l}</td>`);
      expect(out).toContain(esc(VERIFICATION_LEVEL_LABELS[l].label));
    }
    expect(out).toContain(`SVI ${SVI_VERSION}`);
    expect(out).toContain(`ReportV2 ${REPORT_V2_SCHEMA_VERSION}`);
    expect(out).toContain(PIPELINE_VERSION);
    expect(out).toContain(esc(DATA_PRINCIPLE_SENTENCE));
    expect(out).toContain('href="/methodology/calibration"');
    expect(out).toContain('href="/status"');
    // S40: the data-sources table lists every catalogue source (≥ 3), attribution verbatim, cite-only labelled.
    expect(out).toContain('data-testid="methodology-data-sources"');
    expect(out).toContain(`data-source-count="${EXTERNAL_SOURCE_CATALOG.length}"`);
    expect((out.match(/data-source-id="/g) ?? []).length).toBeGreaterThanOrEqual(3);
    for (const s of EXTERNAL_SOURCE_CATALOG) {
      expect(out).toContain(`data-source-id="${s.id}" data-source-status="${s.status}"`);
      expect(out).toContain(esc(s.attribution_text));
      expect(out).toContain(esc(s.licence));
    }
    expect(out).toContain(esc(EN["methodology.sources.use.cite_only"]));
    expect(out).toContain(esc(EN["methodology.sources.use.active"]));
    expect(out).toContain(esc(EN["methodology.sources.cohortNote"]));
    // F-3: no dimension weight anywhere on the page (the owners table has 15/18/12/20/12/10/8/5).
    for (const key of DIM_LEGACY_ORDER) {
      expect(out).not.toMatch(new RegExp(`${DIMENSION_OWNERS[key].weight}\\s*%`));
    }
    expect(out).not.toContain("weight:");
    expect(out).not.toMatch(/PhD/);
    expect(out).not.toMatch(/doctoral/i);
  });

  it("metadata: canonical /methodology with the VI hreflang twin, indexable", async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe(EN["meta.methodology.title"]);
    expect(meta.alternates?.canonical).toBe("https://blockid.au/methodology");
    expect((meta.alternates?.languages as Record<string, string>).vi).toBe("https://blockid.au/vi/methodology");
  });

  it("/vi/methodology renders the Vietnamese catalogue and the VI dimension titles, with the EN data sentence still verbatim", async () => {
    const out = await html(await ViMethodologyRoute());
    expect(out).toContain(esc(VI["methodology.title"]));
    for (const key of DIM_LEGACY_ORDER) expect(out).toContain(esc(DIMENSION_OWNERS[key].titleVi));
    expect(out).toContain(esc(DATA_PRINCIPLE_SENTENCE));
    expect(out).toContain(esc(VI["solutions.principle.data"]));
    expect(out).toContain(esc(VI["methodology.sources.title"]));
    expect(out).toContain(esc(VI["methodology.sources.use.cite_only"]));
    expect((out.match(/data-source-id="/g) ?? []).length).toBe(EXTERNAL_SOURCE_CATALOG.length);
    expect(out).not.toMatch(/PhD/);
  });

});

describe("methodology.* catalogue parity (en ⇄ vi)", () => {
  const enKeys = Object.keys(EN).filter((k) => k.startsWith("methodology.") || k.startsWith("meta.methodology."));
  const viKeys = Object.keys(VI).filter((k) => k.startsWith("methodology.") || k.startsWith("meta.methodology."));

  it("every key exists in both catalogues and none is empty", () => {
    expect(enKeys.filter((k) => !(k in VI))).toEqual([]);
    expect(viKeys.filter((k) => !(k in EN))).toEqual([]);
    for (const k of enKeys) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
    }
    expect(enKeys.length).toBeGreaterThanOrEqual(60);
  });

  it("the {min}/{max} tokens of the multiplier note exist in both", () => {
    for (const cat of [EN, VI]) {
      expect(cat["methodology.verification.multiplierNote"]).toContain("{min}");
      expect(cat["methodology.verification.multiplierNote"]).toContain("{max}");
    }
  });
});
