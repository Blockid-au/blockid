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

// G30 U06 updates the hero, metadata and closing actions. Below-fold sections
// retain their previous content pending the separate homepage content review.
export const metadata = pageMetadata({
  title: "Know the business before you invest",
  description:
    "Review a business, its key risks and questions to investigate. Start with a website, business documents or a description, or explore a sample report.",
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
        {/* One investor message and the existing intake handoff. */}
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
          primary={{ ...HOME_PRIMARY_CTA, ctaId: "home_final_intake" }}
          secondary={{ ...HOME_SECONDARY_CTA, ctaId: "home_final_sample" }}
          tone="sunken"
        />
      </main>

      {/* The one public footer (S-IA5) — identical on every page; its entity
          strings come from lib/site/legal-entity.ts (G21 P0-A). */}
      <Footer />
    </div>
  );
}
