/**
 * MarketingCtaStrip — the legacy closing-band adapter, now a thin wrapper
 * over the unicorn template's `CtaBand` (G17 P2-A, 2026-09-19).
 *
 * Pages under `(marketing)` import `CtaBand` directly; this adapter stays
 * for the surfaces outside that group so every public page closes on the
 * same band. Same props as before.
 *
 * Server component. Pure presentation. Semantic tokens only.
 */

import { CtaBand } from "@/components/marketing/template";

interface CtaLink {
  href: string;
  label: string;
}

interface MarketingCtaStripProps {
  headline: string;
  subline?: string;
  primary: CtaLink;
  secondary?: CtaLink;
}

export function MarketingCtaStrip({
  headline,
  subline,
  primary,
  secondary,
}: MarketingCtaStripProps) {
  return <CtaBand title={headline} sub={subline} primary={primary} secondary={secondary} />;
}

export default MarketingCtaStrip;
