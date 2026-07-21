import { describe, it, expect } from "vitest";
import {
  parseReportFilename,
  buildShowcaseDataRoomRows,
} from "./report-tagging";

describe("parseReportFilename — agent detection", () => {
  it("routes daily C-Level briefs to canonical agent slugs", () => {
    expect(parseReportFilename("cdo-daily-2026-07-20.md").agent).toBe("cdo");
    expect(parseReportFilename("ceo-daily-2026-07-20.md").agent).toBe("ceo");
    expect(parseReportFilename("cfo-daily-2026-07-20.md").agent).toBe("cfo");
    expect(parseReportFilename("chro-daily-2026-07-20.md").agent).toBe("chro");
    expect(parseReportFilename("ciso-daily-2026-07-20.md").agent).toBe("ciso");
    expect(parseReportFilename("clo-daily-2026-07-20.md").agent).toBe("clo");
    expect(parseReportFilename("cmo-daily-2026-07-20.md").agent).toBe("cmo");
    expect(parseReportFilename("coo-daily-2026-07-20.md").agent).toBe("coo");
    expect(parseReportFilename("cpo-daily-2026-07-20.md").agent).toBe("cpo");
    expect(parseReportFilename("cro-daily-2026-07-20.md").agent).toBe("cro");
    expect(parseReportFilename("cso-daily-2026-07-20.md").agent).toBe("cso");
    expect(parseReportFilename("ccso-daily-2026-07-20.md").agent).toBe("ccso");
    expect(parseReportFilename("ir-daily-2026-07-20.md").agent).toBe("ir");
  });

  it("resolves cro-cmo hybrid review files to cro (leftmost-owner rule)", () => {
    expect(parseReportFilename("cro-cmo-review-v2.0.0-beta.6.md").agent).toBe("cro");
  });

  it("normalises 'customer care' whitespace to slug 'customer-care'", () => {
    expect(parseReportFilename("customer care-daily-2026-07-20.md").agent).toBe(
      "customer-care",
    );
  });

  it("returns 'unknown' for filenames without a recognised prefix", () => {
    expect(parseReportFilename("architecture.md").agent).toBe("unknown");
    expect(parseReportFilename("startup-index-vision.md").agent).toBe("unknown");
    expect(parseReportFilename("blockid-self-analysis-2026-06-18.md").agent).toBe(
      "unknown",
    );
  });
});

describe("parseReportFilename — kind detection", () => {
  it("labels daily / review / milestone / audit / regression", () => {
    expect(parseReportFilename("cdo-daily-2026-07-20.md").kind).toBe("daily");
    expect(parseReportFilename("cto-review-v2.0.0-beta.6.md").kind).toBe("review");
    expect(parseReportFilename("milestone-M013-v2.6.0.md").kind).toBe("milestone");
    expect(parseReportFilename("404-audit-2026-07-20.md").kind).toBe("audit");
    expect(parseReportFilename("qa-regression-2026-07-18.md").kind).toBe(
      "regression",
    );
  });

  it("labels template + template-underscore files", () => {
    expect(parseReportFilename("_daily-report-template.md").kind).toBe("template");
    expect(parseReportFilename("_daily-report-template.md").is_template).toBe(true);
  });

  it("labels architecture / plan / priorities / vision / knowledge-base", () => {
    expect(parseReportFilename("architecture.md").kind).toBe("architecture");
    expect(parseReportFilename("implementing-plan.md").kind).toBe("plan");
    expect(parseReportFilename("next-priorities-2026-07-20.md").kind).toBe(
      "priorities",
    );
    expect(parseReportFilename("startup-index-vision.md").kind).toBe("vision");
    expect(parseReportFilename("clevel-valuation-knowledge-base.md").kind).toBe(
      "knowledge-base",
    );
  });
});

describe("parseReportFilename — phase inference", () => {
  it("maps daily briefs via the agent → phase table", () => {
    expect(parseReportFilename("cmo-daily-2026-07-20.md").phase_at_generation).toBe(3);
    expect(parseReportFilename("cfo-daily-2026-07-20.md").phase_at_generation).toBe(6);
    expect(parseReportFilename("chro-daily-2026-07-20.md").phase_at_generation).toBe(8);
    expect(parseReportFilename("clo-daily-2026-07-20.md").phase_at_generation).toBe(10);
    expect(parseReportFilename("ir-daily-2026-07-20.md").phase_at_generation).toBe(9);
  });

  it("routes cross-cutting kinds even when the agent is unknown", () => {
    expect(parseReportFilename("milestone-M013-v2.6.0.md").phase_at_generation).toBe(
      11,
    );
    expect(parseReportFilename("architecture.md").phase_at_generation).toBe(4);
    expect(parseReportFilename("startup-index-vision.md").phase_at_generation).toBe(
      1,
    );
    expect(parseReportFilename("404-audit-2026-07-20.md").phase_at_generation).toBe(
      4,
    );
    expect(
      parseReportFilename("perf-audit-v2.0.0-beta.7.md").phase_at_generation,
    ).toBe(7);
    expect(
      parseReportFilename("security-secrets-audit-2026-07-20.md")
        .phase_at_generation,
    ).toBe(10);
  });

  it("returns null when neither kind nor agent implies a phase", () => {
    expect(parseReportFilename("ceo-daily-2026-07-20.md").phase_at_generation).toBe(
      null,
    );
    expect(
      parseReportFilename("clevel-valuation-knowledge-base.md").phase_at_generation,
    ).toBe(null);
  });
});

describe("parseReportFilename — date + version extraction", () => {
  it("parses YYYY-MM-DD into an ISO date", () => {
    expect(parseReportFilename("cdo-daily-2026-07-20.md").generated_at).toBe(
      "2026-07-20",
    );
  });

  it("rejects invalid dates like Feb 30", () => {
    expect(parseReportFilename("cdo-daily-2026-02-30.md").generated_at).toBe(null);
  });

  it("captures a semver-with-prerelease suffix", () => {
    expect(parseReportFilename("cto-review-v2.0.0-beta.6.md").version).toBe(
      "v2.0.0-beta.6",
    );
    expect(parseReportFilename("milestone-M013-v2.6.0.md").version).toBe("v2.6.0");
  });

  it("returns null version when absent", () => {
    expect(parseReportFilename("cdo-daily-2026-07-20.md").version).toBe(null);
  });
});

describe("parseReportFilename — tag composition", () => {
  it("emits ordered stable tags: agent, kind, version, date, phase", () => {
    const t = parseReportFilename("cto-review-v2.0.0-beta.6.md");
    expect(t.tags).toEqual([
      "agent:cto",
      "kind:review",
      "version:v2.0.0-beta.6",
      "phase:4",
    ]);
  });

  it("omits agent tag when unknown", () => {
    const t = parseReportFilename("startup-index-vision.md");
    expect(t.tags).toEqual(["kind:vision", "phase:1"]);
  });
});

describe("buildShowcaseDataRoomRows", () => {
  it("filters templates by default and sorts by generated_at desc", () => {
    const rows = buildShowcaseDataRoomRows({
      filenames: [
        "web/content/reports/_daily-report-template.md",
        "web/content/reports/cdo-daily-2026-07-19.md",
        "web/content/reports/cdo-daily-2026-07-20.md",
        "web/content/reports/architecture.md",
      ],
    });
    expect(rows.map((r) => r.filename)).toEqual([
      "cdo-daily-2026-07-20.md",
      "cdo-daily-2026-07-19.md",
      "architecture.md",
    ]);
  });

  it("keeps templates when includeTemplates=true", () => {
    const rows = buildShowcaseDataRoomRows({
      filenames: ["_daily-report-template.md"],
      includeTemplates: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].generated_by_agent).toBe("unknown");
  });

  it("emits source_path prefixed with web/content/reports/", () => {
    const rows = buildShowcaseDataRoomRows({
      filenames: ["cdo-daily-2026-07-20.md"],
    });
    expect(rows[0].source_path).toBe("web/content/reports/cdo-daily-2026-07-20.md");
    expect(rows[0].title).toBe("cdo daily 2026 07 20");
  });

  it("stable-sorts undated rows alphabetically at the tail", () => {
    const rows = buildShowcaseDataRoomRows({
      filenames: ["startup-index-vision.md", "architecture.md"],
    });
    expect(rows.map((r) => r.filename)).toEqual([
      "architecture.md",
      "startup-index-vision.md",
    ]);
  });
});
