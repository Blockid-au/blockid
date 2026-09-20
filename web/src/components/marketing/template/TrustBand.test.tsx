// Colocated guard for the G21 P0-A TrustBand: the rows come from
// `trustRows()` (entity · ACN/ABN · methodology version · support), the four
// bullets reuse the registered disclaimer / data-principle sentences rather
// than new wording, every link is a real route, and the markup carries the
// template contract (heading id, focus ring, no raw hex — the folder-wide
// hex/emoji sweep in template.test.tsx covers this file too).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL, LEGAL_ENTITY_ACN_LABEL, trustRows } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { FOCUS_RING } from "./primitives";
import { TRUST_BAND_ID, TrustBand, scoreDisclaimerText, trustBullets } from "./TrustBand";
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
