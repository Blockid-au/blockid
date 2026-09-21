// Colocated guard for the G21 P0-A TrustBand: the rows come from
// `trustRows()` (entity · ACN/ABN · methodology version · support), the four
// bullets reuse the registered disclaimer / data-principle sentences rather
// than new wording, every link is a real route, and the markup carries the
// template contract (heading id, focus ring, no raw hex — the folder-wide
// hex/emoji sweep in template.test.tsx covers this file too).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import viMessages from "@/lib/i18n/messages/vi.json";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL, LEGAL_ENTITY_ACN_LABEL, trustRows } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { FOCUS_RING } from "./primitives";
import { DATA_PRINCIPLE_SENTENCE_VI, TRUST_BAND_COPY, TRUST_BAND_ID, TrustBand, scoreDisclaimerText, trustBullets } from "./TrustBand";
import * as templateIndex from "./index";

const html = renderToStaticMarkup(<TrustBand />);

describe("<TrustBand />", () => {
  it("is exported from the template index under the documented import path", () => {
    expect(templateIndex.TrustBand).toBe(TrustBand);
    expect(templateIndex.TRUST_BAND_ID).toBe("trust");
  });

  it("is a labelled section with the `${id}-heading` h2 and a deep-link scroll margin", () => {
    expect(html).toMatch(/<section[^>]*id="trust"[^>]*aria-labelledby="trust-heading"/);
    expect(html).toMatch(/<h2[^>]*id="trust-heading"/);
    expect(html).toContain("scroll-mt-20");
    expect(html).toContain('data-testid="trust-band"');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(0);
  });

  it("renders the four trustRows() with the live SVI_VERSION — entity, ACN/ABN, methodology, support", () => {
    const rows = trustRows(SVI_VERSION);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(html, row.label).toContain(`<dt`);
      expect(html, row.label).toContain(row.label);
      expect(html, row.value).toContain(row.value);
    }
    expect(html).toContain(LEGAL_ENTITY.operator);
    expect(html).toContain(LEGAL_ENTITY_ACN_LABEL);
    expect(html).toContain(LEGAL_ENTITY_ABN_LABEL);
    expect(html).toContain(`Startup Value Index v${SVI_VERSION}`);
    expect(html).toContain(LEGAL_ENTITY.supportEmail);
    expect(TRUST_BAND_ID).toBe("trust");
  });

  it("the four bullets reuse the registered sentences: general_all disclaimer + DATA_PRINCIPLE_SENTENCE verbatim", () => {
    const bullets = trustBullets();
    expect(bullets.map((b) => b.title)).toEqual([
      "Privacy and evidence controls",
      "Score disclaimer",
      "Append-only audit trail",
      "Founder consent and data ownership",
    ]);
    const disclaimer = scoreDisclaimerText();
    expect(disclaimer).toMatch(/general information/i);
    expect(disclaimer).toMatch(/financial product advice/i);
    // Every sentence is lifted from the registered surface — no new wording.
    const surface = DISCLAIMER_SURFACES.general_all.body_md.replace(/\*\*/g, "");
    for (const sentence of disclaimer.split(/(?<=\.)\s+/)) expect(surface).toContain(sentence);
    expect(bullets[1]!.body).toBe(disclaimer);
    expect(bullets[3]!.body).toBe(DATA_PRINCIPLE_SENTENCE);
    expect(html).toContain(DATA_PRINCIPLE_SENTENCE.replace(/'/g, "&#x27;"));
  });

  it("links privacy → /legal/privacy, disclaimers → /legal/disclaimers, audit → /methodology#audit; each link carries the focus ring and ≥ 44 px", () => {
    for (const href of ["/legal/privacy", "/legal/disclaimers", "/methodology#audit"]) {
      const m = html.match(new RegExp(`<a\\b[^>]*href="${href.replace(/[/?#]/g, (c) => "\\" + c)}"[^>]*>`));
      expect(m, href).not.toBeNull();
      expect(m![0]).toContain("min-h-11");
      for (const cls of FOCUS_RING.split(" ")) expect(m![0], `${href} ${cls}`).toContain(cls);
    }
    // Every linked route exists on disk (no 404 from a trust band).
    const app = resolve(__dirname, "../../../app/(marketing)");
    expect(existsSync(resolve(app, "legal/[doc]/page.tsx"))).toBe(true);
    expect(existsSync(resolve(app, "methodology/page.tsx"))).toBe(true);
  });

  it("phone-safe: single-column grids under `sm`, long values allowed to wrap, icons hidden from AT", () => {
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>\s*<svg/);
    expect(html).not.toMatch(/#[0-9a-f]{6}\b/i);
  });

  it("accepts a version override and a custom id", () => {
    const custom = renderToStaticMarkup(<TrustBand id="who" sviVersion="9.9.9" />);
    expect(custom).toMatch(/<section[^>]*id="who"[^>]*aria-labelledby="who-heading"/);
    expect(custom).toContain("Startup Value Index v9.9.9");
  });
});

// G22-C — `locale="vi"`: the VI copy table (eyebrow, title, dt labels, four
// bullets, link labels), the same row VALUES and legal links as English, the
// VI disclaimer lifted from the registered surface, the approved VI data
// sentence, and `lang="vi"` on the section.
describe("<TrustBand locale=\"vi\" />", () => {
  const vi = renderToStaticMarkup(<TrustBand locale="vi" />);
  const VI = viMessages as Record<string, string>;

  it("defaults to EN: `data-locale=\"en\"`, `lang=\"en\"`, English eyebrow + title", () => {
    expect(html).toMatch(/<section[^>]*data-locale="en"[^>]*lang="en"/);
    expect(html).toContain(TRUST_BAND_COPY.en.eyebrow);
    expect(html).toContain(TRUST_BAND_COPY.en.title);
    expect(html).not.toContain(TRUST_BAND_COPY.vi.eyebrow);
  });

  it("renders the VI eyebrow, title, four dt labels and four bullet titles — and none of the English ones", () => {
    expect(vi).toMatch(/<section[^>]*data-locale="vi"[^>]*lang="vi"/);
    expect(vi).toContain(TRUST_BAND_COPY.vi.eyebrow);
    expect(vi).toContain(TRUST_BAND_COPY.vi.title);
    for (const label of TRUST_BAND_COPY.vi.rowLabels) expect(vi, label).toContain(`<dt class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">${label}</dt>`);
    const bullets = trustBullets("vi");
    expect(bullets).toHaveLength(4);
    for (const b of bullets) expect(vi, b.title).toContain(b.title);
    for (const en of ["Operating entity", "Methodology version", "Privacy and evidence controls", "Score disclaimer", "Append-only audit trail", "Founder consent and data ownership", "Privacy policy", "All disclaimers"]) {
      expect(vi, en).not.toContain(`>${en}<`);
    }
  });

  it("the row VALUES are identical to English (entity, ACN / ABN, version, support e-mail)", () => {
    for (const row of trustRows(SVI_VERSION)) expect(vi, row.label).toContain(row.value);
    expect(vi).toContain(LEGAL_ENTITY.operator);
    expect(vi).toContain(LEGAL_ENTITY_ACN_LABEL);
    expect(vi).toContain(LEGAL_ENTITY_ABN_LABEL);
    expect(vi).toContain(LEGAL_ENTITY.supportEmail);
  });

  it("the VI disclaimer is lifted from general_all.body_md_vi (no [TODO-VI] marker, no new wording) and the VI data sentence is solutions.principle.data verbatim", () => {
    const disclaimer = scoreDisclaimerText("vi");
    expect(disclaimer).toMatch(/thông tin chung/i);
    expect(disclaimer).not.toContain("TODO-VI");
    const surface = (DISCLAIMER_SURFACES.general_all.body_md_vi ?? "").replace(/\[TODO-VI\]\s*/g, "").replace(/\*\*/g, "");
    for (const sentence of disclaimer.split(/(?<=\.)\s+/)) expect(surface).toContain(sentence);
    expect(trustBullets("vi")[1]!.body).toBe(disclaimer);
    expect(vi).toContain(disclaimer);
    expect(DATA_PRINCIPLE_SENTENCE_VI).toBe(VI["solutions.principle.data"]);
    expect(trustBullets("vi")[3]!.body).toBe(DATA_PRINCIPLE_SENTENCE_VI);
    expect(vi).toContain(DATA_PRINCIPLE_SENTENCE_VI.replace(/'/g, "&#x27;"));
    expect(vi).not.toContain("TODO-VI");
  });

  it("links: privacy + disclaimers unchanged, audit → /vi/methodology#audit; every link keeps the focus ring and ≥ 44 px", () => {
    for (const href of ["/legal/privacy", "/legal/disclaimers", "/vi/methodology#audit"]) {
      const m = vi.match(new RegExp(`<a\\b[^>]*href="${href.replace(/[/?#]/g, (c) => "\\" + c)}"[^>]*>`));
      expect(m, href).not.toBeNull();
      expect(m![0]).toContain("min-h-11");
      for (const cls of FOCUS_RING.split(" ")) expect(m![0], `${href} ${cls}`).toContain(cls);
    }
    expect(vi).not.toContain('href="/methodology#audit"');
    expect(existsSync(resolve(__dirname, "../../../app/vi/methodology/page.tsx"))).toBe(true);
    expect(vi).not.toMatch(/#[0-9a-f]{6}\b/i);
  });

  it("every /vi mirror that mounts the band passes locale=\"vi\" (no English band on a Vietnamese page)", () => {
    const app = resolve(__dirname, "../../../app");
    const viHome = readFileSync(resolve(app, "vi/page.tsx"), "utf8");
    expect(viHome).toContain('<TrustBand locale="vi" />');
    const shell = readFileSync(resolve(app, "(marketing)/solutions/solutions-shared.tsx"), "utf8");
    expect(shell).toContain("<TrustBand locale={lang} />");
    const methodology = readFileSync(resolve(app, "(marketing)/methodology/methodology-page.tsx"), "utf8");
    expect(methodology).toContain("<TrustBand locale={p.locale} />");
    const viPilot = readFileSync(resolve(app, "(marketing)/pilot/pilot-page-body.tsx"), "utf8");
    expect(viPilot).toContain('lang === "vi" ? <TrustBand locale="vi" /> : <TrustBand />');
  });
});
