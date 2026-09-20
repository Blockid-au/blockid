/**
 * /solutions — index of the five persona solutions pages.
 *
 * The individual persona pages live at
 *   /solutions/investor, /solutions/accelerator, /solutions/advisor,
 *   /solutions/founder, /solutions/vn-sme
 * (see solutions-shared.tsx). This index lets each persona self-select
 * the right sub-page; evaluators first (D1), founders second.
 *
 * G17 P2-A: on the unicorn template — PageHero → Section (FeatureGrid of
 * the five cards, each one link) → CtaBand. No prices here.
 */

import type { Metadata } from "next";
import { Briefcase, Languages, Rocket, Search, Users, type LucideIcon } from "lucide-react";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/template";
import { SOLUTION_CARDS, type SolutionIcon } from "./solutions-content";

export const metadata: Metadata = pageMetadata({
  title: "Solutions by persona — founders to accelerators",
  description: "Pick your persona: founders raising in Australia, investors screening AU startups, advisory firms, accelerator cohorts or Vietnamese-Australian SMEs.",
  path: "/solutions",
});

export const revalidate = 300;

const ICONS: Record<SolutionIcon, LucideIcon> = {
  rocket: Rocket,
  search: Search,
  briefcase: Briefcase,
  users: Users,
  languages: Languages,
};

export default function SolutionsIndexPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Solutions"
        title="Pick the path that fits your desk."
        sub="One rubric, one score, one Investor Dossier — used by investors, accelerators and advisory firms, and free for the founders they look at."
        ctas={[
          { href: "/analyze", label: "Score a startup", ctaId: "solutions_hero_score" },
          { href: "/pricing?segment=evaluator", label: "Evaluator pricing" },
        ]}
        align="start"
      />

      <Section
        id="personas"
        eyebrow="Who it's for"
        title="Five personas, one platform."
        lede="Each page says what that desk gets, what it costs and where the trial starts."
        tone="sunken"
      >
        <FeatureGrid
          columns={3}
          ariaLabel="Solutions by persona"
          items={SOLUTION_CARDS.map((c) => ({
            icon: ICONS[c.icon],
            title: c.title,
            body: c.body,
            href: c.href,
            cta: c.eyebrow,
            ctaId: `solutions_index_${c.href.split("/").pop()}`,
          }))}
        />
      </Section>

      <CtaBand
        title="Not sure which fits? Start by scoring one idea."
        sub="The first run is free and needs no card."
        primary={{ href: "/analyze", label: "Analyse an idea", ctaId: "solutions_final_score" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </MarketingShell>
  );
}
