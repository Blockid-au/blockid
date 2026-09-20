"use client";

/**
 * HeroSection — the homepage hero: the H1, the sub-line, two CTAs and the
 * omnibox inside its rotating ring (G17 D1/D2, 2026-09-19; G21 P0-B copy,
 * 2026-09-20).
 *
 * G21 P0-B (docs/plans/g21-fi-upgrade-2026-09-20.md § 0): BlockID is
 * evidence-backed startup assessment infrastructure for accelerators,
 * innovation programs and professional evaluators; founders own the data.
 * Copy is the FI1/FI2 pair from `lib/marketing/hero-variants.ts`; the G17
 * evaluator arm E1 and the founder arms F1–F3 stay selectable through
 * `?hero=` so the T0250 A/B protocol can run against the new default. The
 * primary CTA is the paid cohort pilot (`/solutions/accelerator#pilot`),
 * the secondary is the free score; the line under the box is the trust
 * line "Australian-built · Evidence-backed · Founder-controlled data". No
 * price, no agent count, no AI-superiority claim in the hero.
 *
 * The band is the template's `PageHero` (D5) so the homepage hero and every
 * other page hero share one layout; this file only supplies the client
 * pieces — the arm swap and the omnibox submit.
 *
 * ARM SWAP (T0250, unchanged): the server always renders the default arm so
 * the markup hydrates cleanly; only when the URL carries `?hero=F1|F2|F3`
 * does the client swap the H1 after mount. Whichever arm ends up on screen
 * is reported once as `hero_variant_shown{arm}` and rides along on the
 * omnibox `svi_submitted`.
 *
 * THE RING (D2, standing founder request): `SmartIntake` wraps itself in
 * `AnimatedSearchFrame`, so the rotating conic ring lives here. Its
 * gradient is now brand-blue → violet via `--ds-ring-start/end` in
 * globals.css and freezes under `prefers-reduced-motion`.
 *
 * HANDOFF (unchanged): the whole submission — including a dropped File,
 * which cannot be encoded in a URL — is parked in `pending-intake` and
 * claimed by AnalyzeRoot on mount, so nothing is ever typed twice.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import {
  HERO_DEFAULT_ARM,
  heroLine,
  heroSubLineFor,
  parseHeroArm,
  type HeroArm,
} from "@/lib/marketing/hero-variants";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import {
  pendingIntakeQuery,
  setPendingIntake,
} from "@/lib/analyze/pending-intake";
import { PageHero } from "@/components/marketing/template/page-hero";

/** The hero CTAs — exported so the page test and the smoke can pin them. */
export const HERO_PRIMARY_CTA = {
  href: "/solutions/accelerator#pilot",
  label: "Run a cohort pilot",
  ctaId: "hero_pilot",
} as const;
export const HERO_SECONDARY_CTA = {
  href: "/analyze",
  label: "Score my startup",
  ctaId: "hero_score",
} as const;
export const HERO_EYEBROW = "Startup Value Index · by BlockID";
/** The trust line under the search box (G21 P0-B): three facts, no claim. */
export const HERO_TRUST_ITEMS = ["Australian-built", "Evidence-backed", "Founder-controlled data"] as const;
export const HERO_TRUST_LINE = HERO_TRUST_ITEMS.join(" · ");
/** @deprecated G21 P0-B — the founder line moved to the trust line; kept one release for importers. */
export const HERO_FOUNDER_LINE = HERO_TRUST_LINE;

/**
 * Split a one-liner at its em dash so the second breath can carry the
 * `text-action` accent (the founder arms have one; E1 renders plain).
 */
function splitAtDash(text: string): { head: string; tail: string | null } {
  const i = text.indexOf(" — ");
  if (i === -1) return { head: text, tail: null };
  return { head: text.slice(0, i), tail: text.slice(i + 3) };
}

/** `?hero=` never changes without a navigation, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}
function readArmFromUrl(): HeroArm {
  return (
    parseHeroArm(new URLSearchParams(window.location.search).get("hero")) ??
    HERO_DEFAULT_ARM
  );
}
function readServerArm(): HeroArm {
  return HERO_DEFAULT_ARM;
}

export function HeroSection() {
  const router = useRouter();

  // The URL is an external store: the server snapshot is always the default
  // arm, the client snapshot reads `?hero=`. React hydrates against the
  // server value and re-renders with the client one, so there is no
  // mismatch and no setState-in-effect. The effect below only reports.
  const arm = useSyncExternalStore(
    subscribeToNothing,
    readArmFromUrl,
    readServerArm,
  );
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackEvent("hero_variant_shown", { arm: readArmFromUrl() });
  }, []);

  const headline = splitAtDash(heroLine(arm).en);
  const subLine = heroSubLineFor(arm).en;

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    trackEvent("svi_submitted", {
      method: payload.file ? "file" : "text",
      has_file: !!payload.file,
      arm,
    });
    setPendingIntake(payload);
    router.push(pendingIntakeQuery(payload));
  }

  return (
    <PageHero
      eyebrow={HERO_EYEBROW}
      titleProps={{ "data-hero-arm": arm }}
      title={
        headline.tail === null ? (
          headline.head
        ) : (
          <>
            {headline.head}
            {" — "}
            <span className="text-action">{headline.tail}</span>
          </>
        )
      }
      sub={subLine}
      ctas={[HERO_PRIMARY_CTA, HERO_SECONDARY_CTA]}
      visual={
        <div data-testid="hero-search" id="score">
          <SmartIntake onSubmit={handleSmartSubmit} />
        </div>
      }
      footnote={
        <span data-testid="hero-trust-line" className="font-medium tracking-wide text-secondary">
          {HERO_TRUST_LINE}
        </span>
      }
    />
  );
}
