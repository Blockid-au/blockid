import { describe, expect, it } from "vitest";
import type { AnomalySummary } from "./audit-anomaly";
import type { LeadingSignalSummary } from "./leading-signals";
import type { HumanBlockedItem } from "./human-blocked-registry";
import {
  formatWeeklyDigestAnomaliesSection,
  formatWeeklyDigestCsv,
  formatWeeklyDigestEmail,
  formatWeeklyDigestHumanBlockedSection,
  isoWeekKey,
  type WeeklyDigestRow,
} from "./weekly-digest";

function summary(overrides: Partial<LeadingSignalSummary> = {}): LeadingSignalSummary {
  return {
    attributed_total: { count: 10, suppressed: false },
    inactive_7d: { count: 3, suppressed: false },
    inactive_30d: { count: 1, suppressed: false },
    never_generated_report: { count: 4, suppressed: false },
    activated_first_report: { count: 6, suppressed: false },
    median_days_to_first_report: 5,
    activated_first_report_pct: 60,
    ...overrides,
  };
}

function row(
  reseller_code: string,
  display: string,
  s: LeadingSignalSummary,
): WeeklyDigestRow {
  return {
    reseller_id: `rid-${reseller_code.toLowerCase()}`,
    reseller_code,
    reseller_display_name: display,
    summary: s,
  };
}

describe("isoWeekKey", () => {
  it("returns YYYY-Www with two-digit padding", () => {
    expect(isoWeekKey(new Date("2026-01-05T00:00:00Z"))).toBe("2026-W02");
    expect(isoWeekKey(new Date("2026-07-22T00:00:00Z"))).toBe("2026-W30");
  });

  it("year-boundary week rolls into the ISO year the Thursday falls in", () => {
    // 2026-01-01 is a Thursday → ISO week 01 of 2026.
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    // 2027-01-01 is a Friday → ISO week 53 of 2026.
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("formatWeeklyDigestCsv", () => {
  it("emits a header row and sorts by reseller_code", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row("ZULU", "Zulu Advisors", summary()),
      row("ALPHA", "Alpha Advisors", summary({ attributed_total: { count: 20, suppressed: false } })),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "week,reseller_id,reseller_code,reseller_display_name,attributed_total,inactive_7d,inactive_30d,never_generated_report,activated_first_report,activated_first_report_pct,median_days_to_first_report",
    );
    expect(lines[1]).toContain("ALPHA");
    expect(lines[2]).toContain("ZULU");
  });

  it("renders suppressed buckets as <5 and null derived fields as empty", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row(
        "TINY",
        "Tiny Reseller",
        summary({
          attributed_total: { count: null, suppressed: true },
          inactive_7d: { count: null, suppressed: true },
          median_days_to_first_report: null,
          activated_first_report_pct: null,
        }),
      ),
    ]);
    const line = csv.trim().split("\n")[1];
    // week,reseller_id,reseller_code,reseller_display_name,attributed_total,inactive_7d,inactive_30d,never_generated_report,activated_first_report,activated_first_report_pct,median_days_to_first_report
    const cells = line.split(",");
    expect(cells[4]).toBe("<5");
    expect(cells[5]).toBe("<5");
    expect(cells[9]).toBe(""); // activated_first_report_pct null
    expect(cells[10]).toBe(""); // median null
  });

  it("escapes commas + quotes in display names", () => {
    const csv = formatWeeklyDigestCsv("2026-W30", [
      row("ACME", 'Acme, "Inc"', summary()),
    ]);
    expect(csv).toContain('"Acme, ""Inc"""');
  });
});

describe("formatWeeklyDigestEmail", () => {
  it("returns an empty-state paragraph when no rows", () => {
    const html = formatWeeklyDigestEmail("2026-W30", []);
    expect(html).toContain("No active resellers");
  });

  it("renders a row per reseller with suppression + null markers", () => {
    const html = formatWeeklyDigestEmail("2026-W30", [
      row(
        "TINY",
        "Tiny <Reseller>",
        summary({
          attributed_total: { count: null, suppressed: true },
          median_days_to_first_report: null,
          activated_first_report_pct: null,
        }),
      ),
    ]);
    expect(html).toContain("&lt;Reseller&gt;"); // HTML-escaped display name
    expect(html).toContain("&lt;5"); // suppressed bucket rendered
    expect(html).toContain("—"); // null derived fields
  });

  it("sorts rows by reseller_code", () => {
    const html = formatWeeklyDigestEmail("2026-W30", [
      row("ZULU", "Zulu", summary()),
      row("ALPHA", "Alpha", summary()),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });
});

function anomaly(overrides: Partial<AnomalySummary> = {}): AnomalySummary {
  return {
    actor_hotspots: [],
    subject_hotspots: [],
    window_start: "2026-07-15T00:00:00.000Z",
    window_end: "2026-07-22T00:00:00.000Z",
    threshold: 200,
    total_rows_in_window: 0,
    ...overrides,
  };
}

describe("formatWeeklyDigestAnomaliesSection", () => {
  it("returns an empty string when no hotspots fire", () => {
    expect(formatWeeklyDigestAnomaliesSection(anomaly())).toBe("");
  });

  it("renders the actor-hotspot table when actors trigger", () => {
    const html = formatWeeklyDigestAnomaliesSection(
      anomaly({
        actor_hotspots: [
          {
            reseller_id: "rid-abcdefgh-1111-2222-3333-444455556666",
            actor_user_id: "uid-11112222-3333-4444-5555-666677778888",
            count: 250,
            distinct_subjects: 40,
            actions: ["reveal_email", "view_customer_drawer"],
            window_start: "2026-07-15T00:00:00.000Z",
            window_end: "2026-07-22T00:00:00.000Z",
            threshold: 200,
          },
        ],
        total_rows_in_window: 1234,
      }),
      { "rid-abcdefgh-1111-2222-3333-444455556666": "InfoVision" },
    );
    expect(html).toContain("Audit-log anomalies");
    expect(html).toContain("threshold 200");
    expect(html).toContain("1234 privileged-read rows");
    expect(html).toContain("Actor hotspots");
    expect(html).toContain("InfoVision"); // display name resolved
    expect(html).toContain("uid-1111"); // actor UUID truncated
    expect(html).toContain(">250<"); // count cell
    expect(html).toContain("reveal_email, view_customer_drawer"); // actions joined
    expect(html).not.toContain("Subject hotspots"); // empty subject list omitted
  });

  it("renders the subject-hotspot table and falls back to UUID when name unknown", () => {
    const html = formatWeeklyDigestAnomaliesSection(
      anomaly({
        subject_hotspots: [
          {
            reseller_id: "rid-unknown-9999-8888-7777-666655554444",
            subject_user_id: "uid-victim01-2222-3333-4444-555566667777",
            count: 300,
            distinct_actors: 3,
            actions: ["view_customer_drawer"],
            window_start: "2026-07-15T00:00:00.000Z",
            window_end: "2026-07-22T00:00:00.000Z",
            threshold: 200,
          },
        ],
        total_rows_in_window: 1,
      }),
    );
    expect(html).toContain("Subject hotspots");
    expect(html).toContain("1 privileged-read row in window"); // singular
    expect(html).toContain("rid-unkn"); // reseller UUID short form (no display name)
    expect(html).toContain("uid-vict"); // subject UUID short form
    expect(html).not.toContain("Actor hotspots"); // empty actor list omitted
  });

  it("HTML-escapes display names so a hostile reseller name cannot inject markup", () => {
    const html = formatWeeklyDigestAnomaliesSection(
      anomaly({
        actor_hotspots: [
          {
            reseller_id: "rid-xss",
            actor_user_id: "uid-xss",
            count: 201,
            distinct_subjects: 1,
            actions: ["reveal_email"],
            window_start: "2026-07-15T00:00:00.000Z",
            window_end: "2026-07-22T00:00:00.000Z",
            threshold: 200,
          },
        ],
        total_rows_in_window: 201,
      }),
      { "rid-xss": "<script>alert(1)</script>" },
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("formatWeeklyDigestHumanBlockedSection", () => {
  const p15: HumanBlockedItem = {
    id: "P1.5_infovision_seed",
    phase: "P1",
    title: "InfoVision reseller seed",
    blocker: "ABN + GST TBD per H.20.",
    action_required: "Confirm Auschain InfoVision ABN + GST.",
    owner: "admin@blockid.au",
  };
  const p85: HumanBlockedItem = {
    id: "P8.5_env_and_playwright",
    phase: "P8",
    title: "Share-management add-on Stripe env vars",
    blocker: "STRIPE_PRICE_ADDON_SHARE_MGMT_* not minted.",
    action_required: "Mint two Stripe add-on price IDs.",
    owner: "admin@blockid.au",
  };

  it("returns empty string when no items are open", () => {
    expect(formatWeeklyDigestHumanBlockedSection([])).toBe("");
  });

  it("renders one table row per open escalation with the human-review header", () => {
    const html = formatWeeklyDigestHumanBlockedSection([p15, p85]);
    expect(html).toContain("Human-review escalations (2 open)");
    expect(html).toContain("InfoVision reseller seed");
    expect(html).toContain("Share-management add-on Stripe env vars");
    expect(html).toContain("admin@blockid.au");
    expect(html).toContain("<code>docs/plans/reseller-module-goal.md</code>");
  });

  it("sorts rows by phase so P1 renders before P8 regardless of input order", () => {
    const html = formatWeeklyDigestHumanBlockedSection([p85, p15]);
    const p1Idx = html.indexOf("InfoVision reseller seed");
    const p8Idx = html.indexOf("Share-management add-on");
    expect(p1Idx).toBeGreaterThan(-1);
    expect(p8Idx).toBeGreaterThan(-1);
    expect(p1Idx).toBeLessThan(p8Idx);
  });

  it("HTML-escapes hostile item content so a bad registry entry cannot inject markup", () => {
    const bad: HumanBlockedItem = {
      id: "P0.0_xss",
      phase: "P0",
      title: "<script>alert(1)</script>",
      blocker: "\"bad\" & <b>markup</b>",
      action_required: "n/a",
      owner: "admin@blockid.au",
    };
    const html = formatWeeklyDigestHumanBlockedSection([bad]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;bad&quot;");
  });
});
