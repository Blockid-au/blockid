// Fixed allow-list of public pages the quarterly `sector-multiples-refresh`
// cron reads (S27-C, 2026-09-13). The cron fetches ONLY these URLs — never a
// URL from a model, a row or a request — through the DNS-pinned fetcher with
// the SSRF guard (lib/funding/fetch-source.ts → lib/security/outbound-url.ts),
// and every proposal it writes is `status='proposed'` with a verbatim
// excerpt of the fetched text. An admin approves or rejects each one at
// /dashboard/admin/sector-multiples; nothing here changes a live multiple.
//
// Choosing a source: freely accessible (no login / paywall), published by a
// party that states its methodology, and actually carrying revenue multiples
// in the page text (not only in an image or an interactive chart). Each
// entry says what the page is expected to contain so a reviewer can tell a
// good extraction from a bad one — and so a page that stops publishing the
// number is noticed when the cron logs `no_candidates` for it. Two of the
// five are interactive (BVP, Meritech): their server-rendered HTML may carry
// little text, in which case the cron logs it and moves on; they are kept
// because they are the reference indices the static table already cites.
//
// Pure data — no I/O. Colocated tests: multiples-sources.test.ts.

import type { Sector } from "./sector-multiples-static";

export interface MultiplesSource {
  /** Stable id used in logs and the review UI. */
  id: string;
  url: string;
  /** What the admin sees as `source_title` on a proposal. */
  title: string;
  publisher: string;
  /** How often the publisher updates it — a reviewer can judge staleness. */
  cadence: "monthly" | "quarterly" | "annual" | "continuous";
  /** What the page is expected to contain; the extraction prompt quotes it. */
  expects: string;
  /** Sectors the page can plausibly speak to; proposals for other sectors are rejected. */
  sectors: readonly Sector[];
}

export const MULTIPLES_SOURCES: readonly MultiplesSource[] = Object.freeze([
  {
    id: "saas-capital-index",
    url: "https://www.saas-capital.com/the-saas-capital-index/",
    title: "SaaS Capital Index",
    publisher: "SaaS Capital",
    cadence: "monthly",
    expects:
      "The SaaS Capital Index — the median enterprise-value-to-ARR (or EV/revenue) multiple of publicly traded SaaS companies, updated monthly, usually stated as a single figure such as '7.0x' with the month it refers to.",
    sectors: ["saas"],
  },
  {
    id: "aventis-saas-multiples",
    url: "https://aventis-advisors.com/saas-valuation-multiples/",
    title: "Aventis Advisors — SaaS valuation multiples",
    publisher: "Aventis Advisors",
    cadence: "quarterly",
    expects:
      "Median EV/Revenue multiples for public SaaS companies and for private SaaS M&A transactions, by period, with the quarter or year each figure refers to.",
    sectors: ["saas"],
  },
  {
    id: "damodaran-ev-sales",
    url: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/psdata.html",
    title: "Damodaran — Price and EV/Sales multiples by industry (US)",
    publisher: "Aswath Damodaran, NYU Stern",
    cadence: "annual",
    expects:
      "An annual (January) table of price-to-sales and EV-to-sales multiples by industry, e.g. 'Software (System & Application)', 'Software (Internet)', 'Healthcare Information and Technology', 'Retail (Online)', 'Financial Svcs. (Non-bank & Insurance)', 'Biotechnology' — one row per industry with the multiple as a number.",
    sectors: ["saas", "ai", "healthtech", "ecommerce", "fintech", "biotech", "insurtech", "default"],
  },
  {
    id: "bvp-cloud-index",
    url: "https://www.bvp.com/bvp-nasdaq-emerging-cloud-index",
    title: "BVP Nasdaq Emerging Cloud Index",
    publisher: "Bessemer Venture Partners",
    cadence: "continuous",
    expects:
      "The average and/or median EV / NTM revenue multiple of the index's public cloud companies (the page is interactive — the server-rendered HTML may carry only the headline figures).",
    sectors: ["saas"],
  },
  {
    id: "meritech-comps",
    url: "https://www.meritechcapital.com/benchmarking/comps-table",
    title: "Meritech Capital — public SaaS comps table",
    publisher: "Meritech Capital",
    cadence: "continuous",
    expects:
      "A comps table of public software companies with EV / NTM revenue per company and a median / mean row (interactive — the HTML may carry little text).",
    sectors: ["saas", "fintech", "cybertech"],
  },
]);

export function findMultiplesSource(id: string): MultiplesSource | null {
  return MULTIPLES_SOURCES.find((s) => s.id === id) ?? null;
}
