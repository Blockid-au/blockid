// AF13 — the workspace report says when it is from, and points at a newer /analyze run.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { newerAnalysis, ReportFreshnessBanner } from "./report-freshness-banner";

const list = [
  { id: "old", created_at: "2026-09-20T01:00:00.000Z" },
  { id: "new", created_at: "2026-09-25T04:44:58.000Z", input_filename: "deck.pdf" },
  { id: "mid", created_at: "2026-09-24T08:20:55.000Z" },
];

describe("newerAnalysis", () => {
  it("picks the newest run strictly after the report date", () => {
    expect(newerAnalysis(list, "2026-09-24T00:00:00.000Z")?.id).toBe("new");
    expect(newerAnalysis(list, "2026-09-26T00:00:00.000Z")).toBeNull();
    expect(newerAnalysis(list, null)).toBeNull();
    expect(newerAnalysis(list, "not a date")).toBeNull();
  });
});

describe("ReportFreshnessBanner", () => {
  it("always states the report date; links the newer run when there is one", () => {
    const out = renderToStaticMarkup(<ReportFreshnessBanner asOf="2026-09-23T04:00:00.000Z" newer={list[1]} />);
    expect(out).toContain("Report as of");
    expect(out).toContain('data-testid="tbr-report-newer"');
    expect(out).toContain("deck.pdf");
    expect(out).toContain('href="/analyze/new"');
    const plain = renderToStaticMarkup(<ReportFreshnessBanner asOf="2026-09-23T04:00:00.000Z" newer={null} />);
    expect(plain).not.toContain("tbr-report-newer");
    expect(renderToStaticMarkup(<ReportFreshnessBanner asOf={null} newer={null} />)).toBe("");
  });
});

describe("newerAnalysis — G34 DC01 project link", () => {
  it("never offers a run linked to another project; keeps same-project and unlinked runs", () => {
    const runs = [
      { id: "other", created_at: "2026-09-25T06:00:00.000Z", project_id: "p-other" },
      { id: "mine", created_at: "2026-09-25T05:00:00.000Z", project_id: "p-1" },
      { id: "unlinked", created_at: "2026-09-25T04:00:00.000Z", project_id: null },
    ];
    expect(newerAnalysis(runs, "2026-09-24T00:00:00.000Z", "p-1")?.id).toBe("mine");
    expect(newerAnalysis(runs.slice(2), "2026-09-24T00:00:00.000Z", "p-1")?.id).toBe("unlinked");
    expect(newerAnalysis(runs.slice(0, 1), "2026-09-24T00:00:00.000Z", "p-1")).toBeNull();
  });
});
