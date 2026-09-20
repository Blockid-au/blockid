// G19-S46 — /showcase/blockid/report view: the empty state when no report
// is persisted, and the full unlocked ReportV2 (8 svg[role=img]) with the
// "our own report" banner + data-ownership sentence when it is.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/report-v2/schema";
import { SHOWCASE_REPORT_BANNER, SHOWCASE_REPORT_EMPTY_TESTID, SHOWCASE_REPORT_EMPTY_TITLE, SHOWCASE_REPORT_TESTID, ShowcaseBlockidReportView } from "./blockid-report-view";

/** React escapes quotes in text nodes; compare on the decoded markup. */
const unescape = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe("<ShowcaseBlockidReportView>", () => {
  it("empty state: banner + data sentence + links to /methodology and /tbr/demo, no report, no survey", () => {
    const html = unescape(renderToStaticMarkup(<ShowcaseBlockidReportView loaded={null} />));
    expect(html).toContain(SHOWCASE_REPORT_BANNER);
    expect(html).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(html).toContain('href="/methodology"');
    expect(html).toContain('href="/tbr/demo"');
    expect(html).toContain(SHOWCASE_REPORT_EMPTY_TITLE);
    expect(html).toContain(`data-testid="${SHOWCASE_REPORT_EMPTY_TESTID}"`);
    expect(html).not.toContain(`data-testid="${SHOWCASE_REPORT_TESTID}"`);
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("tbr-clarity");
  });

  it("populated: renders the stored ReportV2 unlocked — 8 primary svg[role=img], no unlock rail, snapshot id + run date in the banner", () => {
    const report = { ...demoReportV2(), source: "pipeline" as const };
    const html = unescape(renderToStaticMarkup(<ShowcaseBlockidReportView loaded={{ report, snapshotId: "0f3c2a9b-1111-4222-8333-444455556666", generatedAt: "2026-09-20T09:30:00.000Z" }} />));
    expect(html).toContain(SHOWCASE_REPORT_BANNER);
    expect(html).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(html).toContain(`data-testid="${SHOWCASE_REPORT_TESTID}"`);
    expect(html).toContain('data-snapshot-id="0f3c2a9b-1111-4222-8333-444455556666"');
    expect(html).toContain("0f3c2a9b");
    expect(html).toContain("20 Sept 2026");
    expect((html.match(/role="img"/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect((html.match(/data-tbr-primary="/g) ?? []).length).toBe(8);
    expect(html).toContain('data-tbr-tier="standard"');
    expect(html).not.toContain("data-tbr-unlock=");
    expect(html).not.toContain("data-tbr-locked=");
    expect(html).not.toContain(SHOWCASE_REPORT_EMPTY_TITLE);
    expect(html).not.toContain("tbr-clarity");
  });
});
