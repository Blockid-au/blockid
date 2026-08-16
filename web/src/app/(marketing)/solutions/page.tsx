/**
 * /solutions — index of the four persona solutions pages.
 *
 * The individual persona pages already live at
 *   /solutions/founder, /solutions/vn-sme,
 *   /solutions/investor, /solutions/accelerator
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
  title: "Solutions for founders, investors, accelerators and VN SMEs — BlockID",
  description:
    "Pick the persona that fits — founders raising in Australia, angel and VC investors screening AU startups, accelerator programs running cohorts, or Vietnamese-Australian SMEs formalising for growth.",
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
  {
    href: "/solutions/investor",
    eyebrow: "For investors",
    title: "Screen and monitor AU startup deal-flow",
    body: "Objective SVI scoring, cohort benchmarks, and structured data rooms — so you can compare seed-stage founders on the same rubric and skip the noise.",
  },
  {
    href: "/solutions/accelerator",
    eyebrow: "For accelerators",
    title: "Run a cohort with white-label dashboards",
    body: "Give every founder in your program a workspace, track cohort-level SVI progress, and generate quarterly LP reports without a data engineer.",
  },
  {
    href: "/solutions/vn-sme",
    eyebrow: "For VN SMEs",
    title: "Formalise a Vietnamese-Australian venture",
    body: "The bilingual playbook for Vietnamese-Australian founders — from ABN registration through ESIC eligibility to your first AU-facing landing page.",
  },
];

export default function SolutionsIndexPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Solutions"
        title="Pick the path that fits your stage"
        subtitle="BlockID is used by early-stage founders, investors, accelerators and Vietnamese-Australian SMEs. Each persona gets a purpose-built surface on the same underlying platform."
      />

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <ul className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block h-full rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 transition-colors hover:border-[var(--fintech-accent)]"
              >
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-accent)]">
                  {c.eyebrow}
                </p>
                <h2 className="text-lg font-semibold text-[var(--fintech-ink)]">
                  {c.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
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
