/**
 * MarketingHero — the legacy hero adapter, now a thin wrapper over the
 * unicorn template's `PageHero` (G17 P2-A, 2026-09-19).
 *
 * Every page under `(marketing)` imports `PageHero` directly; this adapter
 * stays for the surfaces outside that group that still call it (/demo,
 * /security-audit, /status, /stats, /for/[segment], /reports/[ticker],
 * /tbr/demo, not-found) so they render on the same band without a
 * per-page rewrite. Same props as before; the H1 id is now the template's
 * `page-hero-heading`.
 *
 * Server component. Pure presentation.
 */

import type { ReactNode } from "react";
import { PageHero, type Cta } from "@/components/marketing/template";

interface MarketingCta {
  href: string;
  label: string;
}

interface MarketingHeroProps {
  eyebrow?: string;
  title: string | ReactNode;
  subtitle?: string;
  primaryCta?: MarketingCta;
  secondaryCta?: MarketingCta;
}

export function MarketingHero({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: MarketingHeroProps) {
  const ctas: Cta[] = [];
  if (primaryCta) ctas.push(primaryCta);
  if (secondaryCta) ctas.push({ ...secondaryCta, variant: "secondary" });
  return (
    <PageHero
      eyebrow={eyebrow}
      title={title}
      sub={subtitle}
      ctas={ctas.length > 0 ? ctas : undefined}
      align="start"
    />
  );
}

export default MarketingHero;
