"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import { pendingIntakeQuery, setPendingIntake } from "@/lib/analyze/pending-intake";
import { HOMEPAGE_COPY_VERSION, HOMEPAGE_HERO, HOMEPAGE_SAMPLE_HREF } from "@/lib/marketing/homepage-hero";
import { PageHero } from "@/components/marketing/template/page-hero";

/** One homepage copy version for SSR and hydration; ?hero= no longer changes it. */
export function HeroSection({ locale = "en" }: { locale?: "en" | "vi" }) {
  const router = useRouter();
  const copy = HOMEPAGE_HERO[locale];
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackEvent("hero_variant_shown", { arm: HOMEPAGE_COPY_VERSION, copy_version: HOMEPAGE_COPY_VERSION, locale });
  }, [locale]);

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    trackEvent("svi_submitted", {
      method: payload.file ? "file" : "text",
      has_file: !!payload.file,
      arm: HOMEPAGE_COPY_VERSION,
      copy_version: HOMEPAGE_COPY_VERSION,
      locale,
    });
    setPendingIntake(payload);
    router.push(pendingIntakeQuery(payload));
  }

  return (
    <PageHero
      className="[--ds-ring-start:var(--ds-accent)] [--ds-ring-end:var(--ds-accent-secondary)] [--color-accent-600:var(--ds-accent-secondary)] [--color-accent:var(--ds-accent)] [--color-accent-soft:var(--color-surface-sunken)]"
      eyebrow={copy.eyebrow}
      titleProps={{ "data-hero-arm": HOMEPAGE_COPY_VERSION }}
      title={copy.title}
      sub={copy.sub}
      visual={
        <div data-testid="hero-search" id="score" className="space-y-4">
          <SmartIntake onSubmit={handleSmartSubmit} placeholder={copy.placeholder} copy={copy} />
          <a href={HOMEPAGE_SAMPLE_HREF} data-cta-id="hero_sample_report" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action">
            {copy.sample}<span aria-hidden>→</span>
          </a>
        </div>
      }
      footnote={<span data-testid="hero-trust-line">{copy.outcomes}</span>}
    />
  );
}
