// /showcase/atlassian — Case study #1: Atlassian (NASDAQ: TEAM).
// Research: docs/showcase/atlassian/RESEARCH.md (every claim cited).
// Track C goal item.

import Link from "next/link";

export const dynamic = "force-dynamic";

interface Milestone {
  year: number | string;
  phase: number;
  headline: string;
  detail: string;
  source: string;
  usd?: string;
}

const PHASE_NAMES: Record<number, string> = {
  1: "Vision / Day-0 Idea",
  2: "Idea Validation",
  3: "Market Research",
  4: "MVP / Product Discovery",
  5: "PMF / Early Traction",
  6: "Revenue / Business Model",
  7: "Growth / Analytics",
  8: "Team & Culture",
  9: "Funding-Ready",
  10: "Fundraise / Term Sheet",
  11: "Post-Funding / Growth Scale",
  12: "Exit / Beyond",
};

const TIMELINE: Milestone[] = [
  {
    year: 2002,
    phase: 1,
    headline: "Founded in Sydney by Cannon-Brookes + Farquhar",
    detail:
      "Two UNSW 2001 graduates bootstrap on ~A$10K credit card, 50/50 founder split, explicit goal 'don't wear suits, earn more than PwC's offer'.",
    source: "https://en.wikipedia.org/wiki/Atlassian",
  },
  {
    year: 2002,
    phase: 4,
    headline: "Jira v1.0 released",
    detail:
      "First flagship product; low-price self-serve model — no salespeople, no consultants, no arm-and-a-leg licensing.",
    source: "https://braindump.maxoxo.me/posts/20221011135007-a_brief_history_of_atlassian_and_jira/",
  },
  {
    year: 2003,
    phase: 5,
    headline: "First US$1M revenue; American Airlines buys Jira via self-serve",
    detail:
      "Zero-touch product-led growth. AA orders Jira on a fax with no human sales contact — the origin of the 'no sales team' Atlassian legend.",
    source: "https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons",
    usd: "$1M",
  },
  {
    year: 2004,
    phase: 4,
    headline: "Confluence v1.0",
    detail: "On-prem wiki for small dev teams — the second flagship.",
    source: "https://nira.com/confluence-history/",
  },
  {
    year: 2005,
    phase: 8,
    headline: "First profitable year; ShipIt hackathon begins",
    detail:
      "Quarterly 24-hour cross-functional hackathon that still runs (61 editions by 2024, most recently themed AI).",
    source:
      "https://www.atlassian.com/blog/inside-atlassian/atlassians-shipit-hackathon-for-technical-and-non-technical-teams",
  },
  {
    year: 2006,
    phase: 8,
    headline: "Atlassian Foundation + Pledge 1% co-founded",
    detail: "1% of profits, product, equity, and employee time to social impact.",
    source:
      "https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons",
  },
  {
    year: 2007,
    phase: 8,
    headline: "Five core values codified",
    detail:
      "Open company, no bullshit · Build with heart and balance · Don't #@!% the customer · Play as a team · Be the change you seek.",
    source: "https://www.atlassian.com/company",
  },
  {
    year: 2010,
    phase: 10,
    headline: "Accel Partners US$60M — 100% secondary",
    detail:
      "Rich Wong joins board. Atlassian had ~$55M cash on hand already; the round provided founder + employee liquidity, not treasury cash.",
    source:
      "https://techcrunch.com/2010/07/14/atlassian-accel-60-million/",
    usd: "$60M",
  },
  {
    year: 2010,
    phase: 11,
    headline: "Bitbucket acquisition (Mercurial/Git hosting)",
    detail: "Funded from Accel round; expands product surface into source hosting.",
    source: "https://techcrunch.com/2010/09/29/atlassian-buys-mercurial-project-hosting-site-bitbucket/",
  },
  {
    year: 2012,
    phase: 8,
    headline: "Board scales — Doug Burgum (Chair), Enrique Salem, Jay Parikh",
    detail:
      "First heavyweight independents. Governance chassis built years before IPO.",
    source: "https://techcrunch.com/2012/07/19/atlassian-board-doug-burgum/",
  },
  {
    year: 2014,
    phase: 10,
    headline: "T. Rowe Price secondary US$150M @ US$3.3B valuation",
    detail:
      "Second and final pre-IPO round; again 100% secondary. Sequoia + Dragoneer + Accel also participate.",
    source:
      "https://techcrunch.com/2014/04/08/atlassian-shareholders-sell-150m-of-their-equity-in-a-secondary-sale-valuing-the-firm-at-3-3b",
    usd: "$150M",
  },
  {
    year: 2014,
    phase: 9,
    headline: "UK Plc holding-company reorganisation",
    detail:
      "Atlassian Corporation Plc formed in England & Wales — governance chassis that supports dual-class shares under English company law, unavailable on ASX.",
    source:
      "https://www.startupdaily.net/topic/business/atlassian-is-now-officially-an-american-company/",
  },
  {
    year: "2015-12-10",
    phase: 10,
    headline: "IPO on NASDAQ:TEAM at US$21 (above range)",
    detail:
      "22M Class A + 3.3M greenshoe, US$462M raised, +32% first-day pop, market cap US$5.8B. Class B (10 votes/share) retained ~96.7% of voting power despite economic minority.",
    source:
      "https://venturebeat.com/2015/12/10/atlassian-closes-at-27-78-per-share-up-32-from-its-ipo-price/",
    usd: "$462M gross",
  },
  {
    year: 2017,
    phase: 11,
    headline: "Trello acquisition US$425M",
    detail:
      "US$360M cash + US$65M stock + retention RSUs. Largest deal to date; 18th in 14 years.",
    source:
      "https://www.atlassian.com/company/news/press-releases/atlassian-to-acquire-trello-to-expand-teamwork-platform0",
    usd: "$425M",
  },
  {
    year: 2018,
    phase: 11,
    headline: "OpsGenie acquisition US$295M + Slack partnership",
    detail:
      "$259.5M cash + $36.3M restricted shares for OpsGenie. Sold HipChat/Stride IP to Slack + took Slack equity stake.",
    source:
      "https://www.atlassian.com/blog/announcements/new-atlassian-slack-partnership",
    usd: "$295.8M",
  },
  {
    year: 2020,
    phase: 11,
    headline: "Team Anywhere — distributed-first",
    detail: "Formal distributed-first model announced. Austin grows as US hub.",
    source:
      "https://www.getstealery.com/blog/hq-locations/atlassian-headquarters-office-locations",
  },
  {
    year: "2022-10-03",
    phase: 12,
    headline: "Redomiciled from UK Plc to Delaware Corporation",
    detail:
      "Scheme of Arrangement sanctioned by UK High Court, 1-for-1 share exchange, first trade of Delaware-listed TEAM.",
    source: "https://www.businesswire.com/news/home/20221003005143/en/",
  },
  {
    year: "2023-10-12",
    phase: 11,
    headline: "Loom acquisition US$975M",
    detail:
      "~$880M cash + ~$95M equity awards. Larger than the prior 20 acquisitions combined. Closed 2023-11-30 in <50 days.",
    source:
      "https://www.businesswire.com/news/home/20231012832576/en/Atlassian-to-Acquire-Loom-to-Supercharge-Team-Collaboration",
    usd: "$975M",
  },
  {
    year: 2024,
    phase: 11,
    headline: "Rovo AI launched at Team '24; Cannon-Brookes sole CEO",
    detail: "Farquhar steps back from co-CEO role after 22-year partnership.",
    source: "https://techcrunch.com/2024/05/01/atlassian-launches-rovo-its-new-ai-teammate/",
  },
  {
    year: "FY2025",
    phase: 11,
    headline: "Revenue US$5.2B (+20% YoY), 83% gross margin, ~US$1.4B FCF",
    detail: "Board authorises US$1.5B additional Class A buyback.",
    source:
      "https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm",
    usd: "$5.2B revenue",
  },
];

export default function AtlassianShowcasePage() {
  const byPhase = new Map<number, Milestone[]>();
  for (const m of TIMELINE) {
    if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
    byPhase.get(m.phase)!.push(m);
  }
  const phaseOrder = Array.from(byPhase.keys()).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 text-sm">
          <Link href="/showcase" className="text-brand-700 hover:underline">
            ← Showcase library
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">Atlassian</h1>
          <p className="mt-1 text-sm text-ink-500">
            🇦🇺 Sydney · NASDAQ: TEAM · Founded 2002 · IPO 2015 · Market cap
            ~US$21.7B (Jul 2026)
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Cannon-Brookes + Farquhar bootstrapped Jira on an A$10K credit card,
            skipped the classic Series A/B/C stack, took one Accel secondary
            (2010) + one T. Rowe Price secondary (2014), and IPO'd on NASDAQ
            with founders each holding ~37% and Class B retaining 96.7% of
            voting power. This is the canonical Australian bootstrap-to-unicorn
            journey.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <Stat label="Bootstrap years" value="8" hint="2002 → 2010 zero VC" />
          <Stat label="Pre-IPO rounds" value="2 secondaries" hint="No primary VC ever" />
          <Stat label="Founders at IPO" value="~74%" hint="Class B voting" />
          <Stat label="Voting power today" value="~42.7%" hint="Cannon-Brookes 13G" />
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">
            5 lessons for a BlockID.au founder
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            <li>
              <strong>Bootstrap-then-secondary preserves equity.</strong> Both
              pre-IPO rounds were 100% secondary (founder liquidity, not
              treasury) — the founders diluted zero.
            </li>
            <li>
              <strong>Dual-class + evergreen ESOP keep control at IPO.</strong>{" "}
              Class B (10 votes/share) held 96.7% voting despite economic
              minority. Requires UK Plc chassis or Delaware C-corp — ASX
              prohibits dual-class.
            </li>
            <li>
              <strong>Acquisitions = ~90% cash + ~10% retention equity.</strong>{" "}
              Trello, OpsGenie, Halp, Loom all followed this pattern. No mega-
              stock deals — refuse to dilute Class B.
            </li>
            <li>
              <strong>Product-led growth ≥ sales-led for a dev buyer.</strong>{" "}
              First US$100M revenue with essentially no sales team. President
              of Sales only hired 9 years in.
            </li>
            <li>
              <strong>Sequence governance progressively.</strong> Start with 3
              of 5 board independent, no sunset provision. Harden post-IPO with
              independent Chair, 3 standing committees, ex-LinkedIn CFO chairing
              Audit.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Milestones by BlockID.au journey phase
          </h2>
          <div className="space-y-6">
            {phaseOrder.map((p) => (
              <div key={p} className="rounded-lg border border-surface-200 bg-white p-4">
                <h3 className="mb-3 text-base font-semibold text-ink-900">
                  Phase {p} · {PHASE_NAMES[p]}
                </h3>
                <ul className="space-y-3">
                  {byPhase.get(p)!.map((m, i) => (
                    <li
                      key={`${p}-${i}`}
                      className="border-l-2 border-brand-300 pl-3 text-sm"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-ink-500">{m.year}</span>
                        <span className="font-semibold text-ink-900">{m.headline}</span>
                        {m.usd && (
                          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800">
                            {m.usd}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-ink-700">{m.detail}</p>
                      <a
                        href={m.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[11px] text-brand-700 hover:underline"
                      >
                        source →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-xs text-ink-500">
          Full research brief with every source citation:{" "}
          <code className="rounded bg-surface-100 px-1">
            docs/showcase/atlassian/RESEARCH.md
          </code>
          . Compiled 2026-07-21 from 3 parallel research subagents. Every dollar
          figure has a live URL.
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
