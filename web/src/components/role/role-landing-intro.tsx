"use client";

/**
 * Per-role landing hero + "1-click start tour" button.
 *
 * Renders the role's `guiding_copy.landing_hero` copy above a button that
 * (re)launches the tour registered in `ROLE_SPECS[role].tourSlug`. Because
 * FeatureSpotlight persists dismissal in localStorage, "starting" a tour
 * really means clearing that key and mounting a scoped FeatureSpotlight so
 * the overlay reappears immediately — no navigation, no toast, no dep.
 *
 * The scoped FeatureSpotlight is only mounted when the user clicks, which
 * means the overlay does not double-render alongside the WorkspaceLayout's
 * global spotlight for founder / advisor pages.
 */

import * as React from "react";
import { Play, Sparkles } from "lucide-react";

import { useLocale } from "@/lib/use-locale";
import {
  ROLE_GUIDING_COPY,
  type RoleGuidingCopy,
} from "@/lib/roles/role-guiding-copy";
import { ROLE_SPECS, type Role } from "@/lib/roles/role-taxonomy";
import {
  dismissKeyFor,
  type FeatureTourSlug,
} from "@/lib/product-tour/feature-tours";
import { FeatureSpotlight } from "@/components/product-tour/feature-spotlight";

interface Props {
  role: Role;
  /** Optional visual variant — "hero" is full width; "compact" fits sidebars. */
  variant?: "hero" | "compact";
  /**
   * True when the enclosing layout already mounts a global <FeatureSpotlight/>
   * (e.g. WorkspaceLayout on /dashboard, /dashboard/advisor,
   * /workspace/accelerator). We then avoid mounting a second scoped spotlight
   * on click — instead we clear localStorage + reload so the layout's global
   * spotlight surfaces the tour and there is exactly one dialog on screen.
   */
  hasGlobalSpotlight?: boolean;
  /** Optional extra content (e.g. secondary CTA) rendered under the buttons. */
  children?: React.ReactNode;
}

const COPY = {
  en: { start: "Start guided tour", restart: "Restart tour" },
  vi: { start: "Bắt đầu tour hướng dẫn", restart: "Chạy lại tour" },
} as const;

export function RoleLandingIntro({
  role,
  variant = "hero",
  hasGlobalSpotlight = false,
  children,
}: Props): React.ReactElement | null {
  const spec = ROLE_SPECS[role];
  const copy: RoleGuidingCopy | undefined = ROLE_GUIDING_COPY[role];
  const [locale] = useLocale();
  const [nonce, setNonce] = React.useState(0);

  if (!spec || !copy) return null;

  const slug = spec.tourSlug as FeatureTourSlug;
  const t = COPY[locale];
  const hero = copy.landing_hero;

  function startTour() {
    try {
      window.localStorage.removeItem(dismissKeyFor(slug));
    } catch {
      // Non-fatal — private mode etc.
    }
    if (hasGlobalSpotlight) {
      // The enclosing layout owns the FeatureSpotlight; reload so it re-reads
      // the cleared dismiss key and surfaces the tour without a duplicate.
      window.location.reload();
      return;
    }
    // No global spotlight — mount a scoped one for this click.
    setNonce((n) => n + 1);
  }

  const rootClass =
    variant === "compact"
      ? "rounded-xl border border-surface-200 bg-white/80 p-4 dark:border-surface-700 dark:bg-surface-900/60"
      : "rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-surface-50 p-6 shadow-sm dark:border-brand-800/60 dark:from-brand-950/40 dark:via-surface-900 dark:to-surface-900";

  return (
    <section
      data-tour={`${role}-home`}
      data-testid={`role-landing-intro-${role}`}
      className={rootClass}
    >
      <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
        <Sparkles className="h-3 w-3" aria-hidden />
        {hero.eyebrow[locale] ?? hero.eyebrow.en}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-ink-900 dark:text-ink-50 sm:text-2xl">
        {hero.title[locale] ?? hero.title.en}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
        {hero.subtitle[locale] ?? hero.subtitle.en}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startTour}
          data-testid={`start-tour-${role}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          {nonce === 0 ? t.start : t.restart}
        </button>
        {children}
      </div>

      {!hasGlobalSpotlight && (
        <FeatureSpotlight key={`spotlight-${slug}-${nonce}`} forceSlug={slug} />
      )}
    </section>
  );
}
