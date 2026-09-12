// Render tests for <RadarUpsellCard /> (T0247). renderToStaticMarkup —
// effects (GA4 view event) do not run in SSR, so the GA4 map is pinned in
// src/lib/analytics.test.ts and the markup here.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarUpsellCard, radarUpsellSentence } from "./radar-upsell-card";

const FACTS = { next_program: { name: "MVP Ventures", ref_id: "g1", days: 81 }, quarter_count: 3 };

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<!-- -->/g, "");
}

describe("radarUpsellSentence", () => {
  it("renders the approved copy with next program, days and quarter count", () => {
    const { variant, nodes } = radarUpsellSentence(FACTS);
    expect(variant).toBe("timeline");
    const out = html(<p>{nodes}</p>);
    expect(out).toContain(
      "This report is a snapshot. <strong class=\"text-primary\">MVP Ventures</strong> closes in 81 days and <strong class=\"text-primary\">3 programs</strong> on your list open new rounds this quarter. Founder Radar watches them for you: alerts, monthly re-match, weekly next step — A$29/mo, first 7 days free.",
    );
  });

  it("drops the clause it cannot fill: next program only / rounds only / singular", () => {
    expect(html(<p>{radarUpsellSentence({ next_program: { name: "Ignite", ref_id: "x", days: 1 }, quarter_count: 0 }).nodes}</p>)).toContain(
      "<strong class=\"text-primary\">Ignite</strong> closes tomorrow. Founder Radar watches",
    );
    expect(html(<p>{radarUpsellSentence({ next_program: { name: "Ignite", ref_id: "x", days: 0 }, quarter_count: 1 }).nodes}</p>)).toContain(
      "closes today and <strong class=\"text-primary\">1 program</strong> on your list opens new rounds this quarter.",
    );
    const roundsOnly = radarUpsellSentence({ next_program: null, quarter_count: 2 });
    expect(roundsOnly.variant).toBe("timeline");
    expect(html(<p>{roundsOnly.nodes}</p>)).toContain(
      "This report is a snapshot. <strong class=\"text-primary\">2 programs</strong> on your list open new rounds this quarter. Founder Radar",
    );
  });

  it("falls back to generic copy when nothing is known — never blank, never invented", () => {
    for (const facts of [null, undefined, { next_program: null, quarter_count: 0 }]) {
      const { variant, nodes } = radarUpsellSentence(facts);
      expect(variant).toBe("generic");
      const out = html(<p>{nodes}</p>);
      expect(out).toContain("This report is a snapshot. Deadlines move and new rounds open through the year. Founder Radar watches them for you: alerts, monthly re-match, weekly next step — A$29/mo, first 7 days free.");
      expect(out).not.toContain("closes in");
    }
  });
});

describe("<RadarUpsellCard />", () => {
  it("founder on the report page: Starter CTA with from=funding_report, no Scout line", () => {
    const out = html(<RadarUpsellCard surface="funding_report" viewer="founder" facts={FACTS} reportId="r1" />);
    expect(out).toContain('data-radar-upsell="true"');
    expect(out).toContain('data-variant="timeline"');
    expect(out).toContain('data-viewer="founder"');
    expect(out).toContain("Deadlines move — Founder Radar A$29/mo");
    expect(out).toContain('href="/signup?plan=founder_starter&amp;trial=1&amp;from=funding_report"');
    expect(out).toContain("Start Founder Radar — 7 days free");
    expect(out).not.toContain("Scout A$79");
    expect(out).not.toContain("investor_angel");
  });

  it("evaluator: adds the secondary Scout A$79 CTA", () => {
    const out = html(<RadarUpsellCard surface="funding_report" viewer="evaluator" facts={FACTS} />);
    expect(out).toContain("Or unlock alerts for the startups you evaluate");
    expect(out).toContain("Scout A$79");
    expect(out).toContain('href="/signup?segment=evaluator&amp;plan=investor_angel&amp;trial=1"');
    expect(out).toContain('data-radar-cta="investor_angel"');
  });

  it("paywall surface: lead line + generic copy + from=funding_paywall", () => {
    const out = html(
      <RadarUpsellCard surface="funding_paywall" viewer="guest" lead="You've spent A$9 on 3 reports — Founder Radar is A$29/mo and includes this report every month." paidReports={3} />,
    );
    expect(out).toContain('data-surface="funding_paywall"');
    expect(out).toContain('data-variant="generic"');
    expect(out).toContain("You&#x27;ve spent A$9 on 3 reports");
    expect(out).toContain("from=funding_paywall");
  });
});
