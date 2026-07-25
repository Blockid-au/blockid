/**
 * HowItWorks — "See How It Works" landing section.
 *
 * Server component. Composes:
 *   1. Section head (eyebrow, visible H2 headline, subhead)
 *   2. <HowItWorksVideo/>  — client boundary for the 16:9 preview
 *   3. Ordered <ol> of five <HowItWorksStep/> — 7-col timeline desktop,
 *      snap-x horizontal strip on mobile
 *   4. Primary CTA anchoring back to the hero search on `/`
 *
 * Copy is driven by HOW_IT_WORKS_COPY (bilingual constant) and icons
 * resolve from an exhaustive Record so any future HowItWorksIcon token
 * that is not mapped fails at type-check time — not at runtime.
 *
 * The parent <section> in web/src/app/page.tsx renders an sr-only H2 with
 * id="how-it-works-heading"; the visible H2 below therefore uses a
 * different id to avoid an a11y duplicate-id violation.
 *
 * Named export + default export are preserved so page.tsx does not need
 * to change its import path.
 */

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  FolderOpen,
  Gauge,
  Rocket,
  Search,
  type LucideIcon,
} from "lucide-react";

import {
  HOW_IT_WORKS_COPY,
  type HowItWorksIcon,
} from "@/content/how-it-works-copy";

import { HowItWorksStep } from "./how-it-works-step";
import { HowItWorksVideo } from "./how-it-works-video";

const ICON_MAP: Record<HowItWorksIcon, LucideIcon> = {
  Search,
  ClipboardList,
  Gauge,
  FolderOpen,
  Rocket,
};

const SCREENSHOTS: Record<string, { src: string; alt: string }> = {
  search: {
    src: "/media/how-it-works/step-search.svg",
    alt: "Search results for a company idea",
  },
  onboard: {
    src: "/media/how-it-works/step-onboard.svg",
    alt: "Onboarding form to pick a startup goal",
  },
  score: {
    src: "/media/how-it-works/step-score.svg",
    alt: "Startup Value Index scorecard with 13 criteria",
  },
  build: {
    src: "/media/how-it-works/step-build.svg",
    alt: "Data-room folders and cap-table preview",
  },
  raise: {
    src: "/media/how-it-works/step-raise.svg",
    alt: "Matched investor shortlist with export action",
  },
};

/** Pick the English string from a LocalisedText.
 *  The parent page is currently English-only; when the locale switcher
 *  wires up, this becomes `copy[locale] ?? copy.en`. */
function t(text: { en: string; vi: string }): string {
  return text.en;
}

export function HowItWorks() {
  const copy = HOW_IT_WORKS_COPY;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Section head — visible H2 uses a distinct id from the sr-only H2
          on the parent <section aria-labelledby="how-it-works-heading">. */}
      <header className="mb-10 flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
          {t(copy.eyebrow)}
        </p>
        <h2
          id="how-it-works-visible-heading"
          className="font-display text-3xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-4xl"
        >
          {t(copy.headline)}
        </h2>
        <p className="max-w-2xl text-base leading-relaxed text-[var(--fintech-ink-muted)]">
          {t(copy.subhead)}
        </p>
      </header>

      {/* Video preview */}
      <HowItWorksVideo
        ariaLabel={t(copy.headline)}
        tagline={t(copy.videoTagline)}
      />

      {/* Timeline — snap-x strip on mobile, 7-col grid on md+ */}
      <ol
        className={[
          "mt-14",
          // Mobile: horizontal snap strip. Overflow is scoped so the
          // section body never triggers a horizontal page scroll.
          "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2",
          // Desktop: vertical stack, each row lays out via grid-cols-7
          // inside the step component itself.
          "md:mx-0 md:block md:space-y-8 md:overflow-visible md:px-0",
        ].join(" ")}
        aria-label={t(copy.headline)}
      >
        {copy.steps.map((step, i) => {
          const Icon = ICON_MAP[step.icon];
          const shot = SCREENSHOTS[step.id] ?? {
            src: "/media/how-it-works-poster.svg",
            alt: t(step.title),
          };
          return (
            <HowItWorksStep
              key={step.id}
              index={i + 1}
              Icon={Icon}
              title={t(step.title)}
              body={t(step.body)}
              screenshot={shot}
              isLast={i === copy.steps.length - 1}
            />
          );
        })}
      </ol>

      {/* Primary CTA — returns to the hero search input on `/`. */}
      <div className="mt-12 flex justify-center">
        <Link
          href={copy.cta.href}
          className={[
            "group inline-flex items-center gap-2 rounded-full px-6 py-3",
            "bg-[var(--color-brand-gold)] text-[var(--color-brand-navy-deep)]",
            "font-semibold shadow-[0_10px_30px_-12px_rgba(56,189,248,0.55)]",
            "transition-transform duration-200 hover:-translate-y-0.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg)]",
          ].join(" ")}
        >
          <span>{t(copy.cta.label)}</span>
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </div>
  );
}

export default HowItWorks;
