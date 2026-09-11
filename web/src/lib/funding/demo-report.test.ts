// Pins the public sample report (S7-B): deterministic across calls, built
// from the seed catalogue with the real matcher, template narrative with the
// `[ref_id]` citations stripped, no secrets, and the constants the page /
// sitemap / smoke test share.

import { describe, expect, it } from "vitest";
import {
  DEMO_CANONICAL,
  DEMO_CTA_HREF,
  DEMO_INTAKE,
  DEMO_REPORT_PATH,
  DEMO_TODAY,
  buildDemoFundingReport,
  demoReportJsonLd,
  stripCitationIds,
} from "./demo-report";

describe("buildDemoFundingReport", () => {
  it("is a ready, guest-shaped report for the fixed NSW / MVP / agtech intake", () => {
    const r = buildDemoFundingReport();
    expect(r.id).toBe("demo");
    expect(r.status).toBe("ready");
    expect(r.is_owner).toBe(false);
    expect(r.project_id).toBeNull();
    expect(r.paid_via).toBeNull();
    expect(r.intake).toEqual(DEMO_INTAKE);
    expect(r.meta?.today).toBe(DEMO_TODAY);
    expect(r.meta?.narrative_source).toBe("template");
  });

  it("matches at least 3 grants, 3 programs and a dated timeline from the seeds", () => {
    const r = buildDemoFundingReport();
    expect(r.grants.length).toBeGreaterThanOrEqual(3);
    expect(r.programs.length).toBeGreaterThanOrEqual(3);
    expect(r.timeline.length).toBeGreaterThanOrEqual(3);
    expect(r.meta?.summary?.grant_count).toBe(r.grants.length);
    expect(r.meta?.summary?.program_count).toBe(r.programs.length);
    expect(r.meta?.summary?.top_grants_amount_max_aud).toBeGreaterThan(0);
    expect(r.meta?.actions).toHaveLength(3);
    // Ranked: scores never increase down the list.
    for (let i = 1; i < r.grants.length; i++) expect(r.grants[i].score).toBeLessThanOrEqual(r.grants[i - 1].score);
  });

  it("is deterministic and memoised", () => {
    const a = buildDemoFundingReport();
    const b = buildDemoFundingReport();
    expect(b).toBe(a);
    expect(JSON.stringify(a)).toContain(`"today":"${DEMO_TODAY}"`);
  });

  it("carries the template narrative with the bracketed ref ids removed", () => {
    const r = buildDemoFundingReport();
    expect(r.narrative_md).toContain("## Where you stand");
    expect(r.narrative_md).toContain("## Next actions");
    expect(r.narrative_md).not.toMatch(/\[[a-z0-9_.-]+\]/i);
    for (const a of r.meta?.actions ?? []) expect(a).not.toMatch(/\[[a-z0-9_.-]+\]/i);
  });

  it("never carries an access token, email or Stripe id (Stripe Atlas the program is fine)", () => {
    const json = JSON.stringify(buildDemoFundingReport());
    expect(json).not.toMatch(/access_token|guest_email|stripe_session|stripe_event|stripe_payment|cs_live|cs_test|@example\.com/i);
  });
});

describe("stripCitationIds", () => {
  it("drops ` [ref]` markers but leaves prose and bold names alone", () => {
    expect(stripCitationIds("- **CSIRO Kick-Start** [csiro-kick_start.v2] — fits. Apply [see the notes]!")).toBe(
      "- **CSIRO Kick-Start** — fits. Apply [see the notes]!",
    );
    expect(stripCitationIds("Lodge the EOI [nsw-mvp]")).toBe("Lodge the EOI");
  });
});

describe("demo constants + JSON-LD", () => {
  it("point at the public route and the money intent", () => {
    expect(DEMO_REPORT_PATH).toBe("/funding/report/demo");
    expect(DEMO_CANONICAL).toBe("https://blockid.au/funding/report/demo");
    expect(DEMO_CTA_HREF).toBe("/funding?intent=money");
  });

  it("emits a minimal schema.org Article", () => {
    const ld = demoReportJsonLd();
    expect(ld["@type"]).toBe("Article");
    expect(ld.url).toBe(DEMO_CANONICAL);
    expect(ld.isAccessibleForFree).toBe(true);
    expect(typeof ld.headline).toBe("string");
  });
});
