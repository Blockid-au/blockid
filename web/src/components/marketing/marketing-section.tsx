/**
 * MarketingSection — the legacy section adapter, now a thin wrapper over
 * the unicorn template's `Section` (G17 P2-A, 2026-09-19).
 *
 * Pages under `(marketing)` import `Section` directly; this adapter stays
 * for the surfaces outside that group (/demo, /status, /stats, /for/*,
 * /reports/*, /tbr/demo, /security-audit) so they share the band, the
 * `max-w-6xl` measure and the 64 px rhythm. `tone="elevated"` maps to the
 * template's `sunken` ground. `id` is optional here (the template requires
 * one): it falls back to a slug of the title, then to React's `useId()`.
 *
 * Server component. Renders a semantic `<section>` element. If `title` is
 * supplied it wires an `aria-labelledby` so screen-reader users get the
 * heading anchor for free.
 */

import { useId, type ReactNode } from "react";
import { Section } from "@/components/marketing/template";

interface MarketingSectionProps {
  id?: string;
  title?: string;
  kicker?: string;
  children: ReactNode;
  tone?: "default" | "elevated";
}

function slug(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return out.length > 0 ? out : undefined;
}

export function MarketingSection({
  id,
  title,
  kicker,
  children,
  tone = "default",
}: MarketingSectionProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sectionId = id ?? slug(title) ?? `section-${reactId}`;
  return (
    <Section
      id={sectionId}
      eyebrow={kicker}
      title={title}
      tone={tone === "elevated" ? "sunken" : "base"}
      divider={false}
    >
      {children}
    </Section>
  );
}

export default MarketingSection;
