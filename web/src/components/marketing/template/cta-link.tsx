/**
 * CtaLink — the one button/link renderer every template primitive uses
 * (G17 D5). Server component: a `next/link` with the shared skin classes,
 * an optional trailing arrow and a `data-cta-id` for the GA4 click hooks.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CTA_CLASS, type Cta, type CtaVariant } from "./primitives";

export interface CtaLinkProps extends Cta {
  /** Fallback skin when the CTA does not name its own. */
  defaultVariant?: CtaVariant;
  arrow?: boolean;
  className?: string;
}

export function CtaLink({
  href,
  label,
  variant,
  ctaId,
  defaultVariant = "primary",
  arrow,
  className,
}: CtaLinkProps) {
  const skin = variant ?? defaultVariant;
  const showArrow = arrow ?? skin === "link";
  return (
    <Link
      href={href}
      data-cta-id={ctaId}
      className={cn(CTA_CLASS[skin], className)}
    >
      {label}
      {showArrow ? <ArrowRight size={16} aria-hidden /> : null}
    </Link>
  );
}

/** Renders a pair of CTAs: the first primary, the second secondary, unless they say otherwise. */
export function CtaRow({
  ctas,
  className,
  align = "start",
}: {
  ctas: readonly Cta[];
  className?: string;
  align?: "start" | "center";
}) {
  if (ctas.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        align === "center" && "justify-center",
        className,
      )}
    >
      {ctas.slice(0, 2).map((cta, i) => (
        <CtaLink
          key={cta.href + cta.label}
          {...cta}
          defaultVariant={i === 0 ? "primary" : "secondary"}
        />
      ))}
    </div>
  );
}
