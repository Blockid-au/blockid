import {
  FileInput,
  FileSearch,
  FileText,
  Gauge,
  ShieldCheck,
  Table2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { HeroSection } from "@/components/marketing/hero-section";
import {
  BuiltFor,
  CtaBand,
  CtaLink,
  FeatureGrid,
  ProblemFlow,
  Section,
  SequenceFlow,
  TrustBand,
  WhyNotChatGPT,
} from "@/components/marketing/template";
import { pageMetadata } from "@/lib/seo/page-meta";
import {
  HOME_BUILT_FOR,
  HOME_BUILT_FOR_SECTION,
  HOME_FINAL,
  HOME_MESSAGES,
  HOME_MESSAGES_SECTION,
  HOME_PRIMARY_CTA,
  HOME_PROBLEM,
  HOME_PROBLEM_STEPS,
  HOME_SAMPLE_LINK,
  HOME_SECONDARY_CTA,
  HOME_SEQUENCE,
  HOME_SEQUENCE_STEPS,
  HOME_WHY_NOT,
} from "./home-content";

// Homepage v7 — evidence-backed assessment infrastructure (G21 P0-B,
// 2026-09-20, docs/plans/g21-fi-upgrade-2026-09-20.md § 0 + § P0-B).
//
// WHY THE REWRITE
//
// v6 (G17, 2026-09-19) spoke to the evaluator ladder with a "who it's for"
// card wall, a three-step how-it-works, a sample card and a stat strip.
// The advisor feedback behind G21 asked for one clearer story: the problem
// programs actually have, the product as ONE sequence, the three messages,
// why this is not ChatGPT, who it is built for, one trust band, one close.
// No feature-card walls, no prices (G17 D3 still holds — the page test pins
// `/A\$\d/` absent), no agent counts, no "our AI is better".
//
// SEVEN BLOCKS, each on the template primitives (docs/design/unicorn-template.md):
//
//   1. Hero + search       HeroSection (client island: FI1/FI2 copy, the
//                          Run a cohort pilot / Score my startup CTAs, the
//                          omnibox in its colour-changing ring, trust line)
//   a. Problem             ProblemFlow — three linked steps, SVG arrows
//   b. Product sequence    SequenceFlow — six steps, whole block → /product
//   c. Three messages      FeatureGrid ×3 — Screen faster · Trust the
//                          evidence · Track improvement
//   d. Why not ChatGPT?    WhyNotChatGPT — two columns + the one line
//   e. Built for           BuiltFor — six text chips, no logos
//   f. TrustBand           lane P0-A's primitive (see
//                          the placeholder comment below)
//   g. Final CTA + footer  CtaBand (dark), then the one public Footer
//
// Every colour is a token; the only client JS is the hero. `PageViewTracker`
// (root layout) and the GA4 hooks in `hero-section.tsx` are unchanged.
export const metadata = pageMetadata({
  // Title = the FI1 H1 shortened to the ≤ 65-char rendered budget
  // ("… | BlockID.au"); description = the FI2 promise, trimmed to the
  // 160-character budget the site-meta sweep enforces.
  title: "Screen startups on one evidence-backed framework",
  description:
    "BlockID turns applications, pitch decks and company evidence into a comparable Startup Value Index, evaluator dossier and improvement plan for every startup.",
  path: "/",
  viPath: "/vi",
});

// Static + ISR. The page reads no request state. 300 s matches the edge
// TTL in lib/security/public-cacheable-routes.ts.
export const revalidate = 300;

const SEQUENCE_ICONS = {
  application: FileInput,
  evidence: FileSearch,
  score: Gauge,
  dossier: FileText,
  cohort: Table2,
  progress: TrendingUp,
} as const;
const MESSAGE_ICONS = { faster: Timer, evidence: ShieldCheck, improvement: TrendingUp } as const;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Skip to content
      </a>

      <NavV2 />

      <main id="main-content">
        {/* 1. Hero — the one H1 (FI1), the FI2 sub-line, the two CTAs, the
            omnibox in its ring, the trust line. Whatever is typed here
            carries straight through to a running analysis. */}
        <HeroSection />

        {/* a. PROBLEM — three linked steps with inline SVG arrows. */}
        <Section
          id="problem"
          eyebrow={HOME_PROBLEM.eyebrow}
          title={HOME_PROBLEM.title}
          lede={HOME_PROBLEM.lede}
          align="center"
          tone="sunken"
        >
          <ProblemFlow steps={HOME_PROBLEM_STEPS} ariaLabel={HOME_PROBLEM.title} />
        </Section>

        {/* b. PRODUCT SEQUENCE — one flow, the whole block links /product;
            the one sample dossier link sits under it. */}
        <Section
          id="sequence"
          eyebrow={HOME_SEQUENCE.eyebrow}
          title={HOME_SEQUENCE.title}
          lede={HOME_SEQUENCE.lede}
          align="center"
        >
          <SequenceFlow
            steps={HOME_SEQUENCE_STEPS.map((s) => ({ ...s, icon: SEQUENCE_ICONS[s.icon] }))}
            href={HOME_SEQUENCE.href}
            linkLabel={HOME_SEQUENCE.linkLabel}
            ctaId={HOME_SEQUENCE.ctaId}
            ariaLabel={HOME_SEQUENCE.title}
          />
          <p className="mt-6 text-center text-sm text-muted">
            <CtaLink
              href={HOME_SAMPLE_LINK.href}
              label={HOME_SAMPLE_LINK.label}
              ctaId={HOME_SAMPLE_LINK.ctaId}
              variant="link"
            />
          </p>
        </Section>

        {/* c. THREE MESSAGES — Screen faster · Trust the evidence · Track improvement. */}
        <Section
          id="messages"
          eyebrow={HOME_MESSAGES_SECTION.eyebrow}
          title={HOME_MESSAGES_SECTION.title}
          align="center"
          tone="sunken"
        >
          <FeatureGrid
            columns={3}
            ariaLabel={HOME_MESSAGES_SECTION.eyebrow}
            items={HOME_MESSAGES.map((m) => ({ ...m, icon: MESSAGE_ICONS[m.icon] }))}
          />
        </Section>

        {/* d. WHY NOT CHATGPT? — the record, the rubric, the workflow. */}
        <Section
          id="why-not-chatgpt"
          eyebrow={HOME_WHY_NOT.eyebrow}
          title={HOME_WHY_NOT.title}
          align="center"
        >
          <WhyNotChatGPT other={HOME_WHY_NOT.other} ours={HOME_WHY_NOT.ours} line={HOME_WHY_NOT.line} />
        </Section>

        {/* e. BUILT FOR — text chips, no logos. */}
        <Section
          id="built-for"
          eyebrow={HOME_BUILT_FOR_SECTION.eyebrow}
          title={HOME_BUILT_FOR_SECTION.title}
          lede={HOME_BUILT_FOR_SECTION.lede}
          align="center"
          tone="sunken"
        >
          <BuiltFor items={HOME_BUILT_FOR.map((label) => ({ label }))} ariaLabel={HOME_BUILT_FOR_SECTION.eyebrow} />
        </Section>

        {/* f. TRUST BAND — operating entity · ABN/ACN · methodology version ·
            privacy and evidence controls · score disclaimer · audit trail ·
            founder consent · data ownership (G21 P0-A). */}
        <TrustBand />

        {/* g. FINAL CTA — the same two CTAs as the hero. */}
        <CtaBand
          title={HOME_FINAL.title}
          sub={HOME_FINAL.sub}
          primary={{ ...HOME_PRIMARY_CTA, ctaId: "home_final_pilot" }}
          secondary={{ ...HOME_SECONDARY_CTA, ctaId: "home_final_score" }}
          tone="sunken"
        />
      </main>

      {/* The one public footer (S-IA5) — identical on every page; its entity
          strings come from lib/site/legal-entity.ts (G21 P0-A). */}
      <Footer />
    </div>
  );
}
