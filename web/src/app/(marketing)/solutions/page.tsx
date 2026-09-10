/**
 * /solutions — index of the five persona solutions pages.
 *
 * The individual persona pages already live at
 *   /solutions/founder, /solutions/vn-sme,
 *   /solutions/investor, /solutions/advisor, /solutions/accelerator
 * (see solutions-shared.tsx). The bare `/solutions` path was 404 despite
 * being referenced from nav-tree hrefs, footer links, and the sitemap
 * (indirectly via persona pages). This index card grid lets each persona
 * self-select the right sub-page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "Solutions for founders, investors, advisors, accelerators and VN SMEs — BlockID",
  description:
    "Pick the persona that fits — founders raising in Australia, angel and VC investors screening AU startups, advisory firms reviewing clients, accelerator programs running cohorts, or Vietnamese-Australian SMEs formalising for growth.",
  alternates: { canonical: `${SITE_URL}/solutions` },
  robots: { index: true, follow: true },
};

interface SolutionCard {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
}

const CARDS: SolutionCard[] = [
  {
    href: "/solutions/founder",
    eyebrow: "For founders",
    title: "Score, plan and raise your Australian startup",
    body: "Paste an idea, get a Startup Value Index score, and follow the guided roadmap from Day-0 to Seed round — with AU-specific tooling for ESIC, R&D and s708 baked in.",
  },
  // 2026-09-10 (T0274, G12): the three evaluator personas now sell the
  // Scout / Firm / Program ladder — A$3 a report, 7-day card-required trial.
  // Each card carries that persona's approved line from the messaging pack.
  {
    href: "/solutions/investor",
    eyebrow: "For investors",
    title: "One score across 8 investor dimensions, backed by the startup's own evidence",
    body: "Screen a deal in minutes on the same 8-dimension, 13-criteria rubric, reviewed by 11 C-Level agents and an auditor — and watch it move every week. A$3 a report; Scout from A$79 a month.",
  },
  {
    href: "/solutions/advisor",
    eyebrow: "For advisors and consulting firms",
    title: "A C-suite review of every client, in AUD, with ESIC and R&D Tax checks",
    body: "Score every client you advise on one rubric, with valuation in AUD and ESIC, R&D Tax Incentive and s708 checks — white-labelled under your firm's brand. A$3 a report; Firm from A$149 a month.",
  },
  {
    href: "/solutions/accelerator",
    eyebrow: "For accelerators and incubators",
    title: "Score the whole cohort on one rubric, then show sponsors the progress",
    body: "Every startup in the program on the same 8-dimension, 13-criteria rubric, re-scored as it changes, so sponsors see movement rather than memory. Program from A$349 a month; multi-cohort programs talk to us.",
  },
  {
    href: "/solutions/vn-sme",
    eyebrow: "For VN SMEs",
    // 2026-09-09: there is no "bilingual playbook", no ABN-registration flow
    // and no ESIC-eligibility walkthrough behind this card. What exists is a
    // Vietnamese interface over the same product.
    title: "The same platform, in Vietnamese",
    body: "The site and the product's surfaces render in Vietnamese. The analysis is unchanged, and pricing stays in AUD, GST-inclusive, with an ATO tax invoice.",
  },
];

export default function SolutionsIndexPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Solutions"
        title="Pick the path that fits your stage"
        subtitle="BlockID is used by early-stage founders, investors, advisory firms, accelerators and Vietnamese-Australian SMEs. Each persona gets a purpose-built surface on the same underlying platform."
      />

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <ul className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block h-full rounded-2xl border border-line-subtle bg-surface-sunken p-6 transition-colors hover:border-action"
              >
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-action">
                  {c.eyebrow}
                </p>
                <h2 className="text-lg font-semibold text-primary">
                  {c.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-secondary">
                  {c.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <MarketingCtaStrip
        headline="Not sure which fits? Start by scoring one idea."
        primary={{ href: "/svi", label: "Analyse an idea" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
