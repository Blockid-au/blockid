// EmptyDashboardState — friendly first-run panel for founder surfaces.
//
// Renders a hero CTA plus three quick-start cards. Reused across the
// founder dashboard, SVI dashboard, and data-room pages so a brand-new
// account never lands on a wall of "—" placeholders. Copy is customisable
// so each surface can name its own primary call-to-action while keeping
// the visual language consistent.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface QuickStartCard {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
}

export interface EmptyDashboardStateProps {
  eyebrow?: string;
  title: string;
  body: string;
  primaryCta: { href: string; label: string };
  cards: QuickStartCard[];
  /** Visual variant — `dark` matches the founder dashboard palette. */
  variant?: "light" | "dark";
}

export function EmptyDashboardState({
  eyebrow,
  title,
  body,
  primaryCta,
  cards,
  variant = "light",
}: EmptyDashboardStateProps) {
  const isDark = variant === "dark";
  const panelClasses = isDark
    ? "rounded-2xl border border-action/25 bg-action/5 backdrop-blur-sm p-8 text-center"
    : "rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-emerald-50/40 p-8 text-center shadow-sm";
  const titleClasses = isDark
    ? "text-2xl font-bold text-primary mb-2"
    : "text-2xl font-bold text-ink-800 mb-2";
  const bodyClasses = isDark
    ? "text-sm text-muted mb-6 max-w-md mx-auto"
    : "text-sm text-ink-600 mb-6 max-w-md mx-auto";
  const eyebrowClasses = isDark
    ? "text-[11px] font-semibold uppercase tracking-wide text-action mb-2"
    : "text-[11px] font-semibold uppercase tracking-wide text-brand-600 mb-2";
  const primaryClasses = isDark
    ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-on-action hover:opacity-90 transition-opacity"
    : "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors";

  const cardClasses = isDark
    ? "group rounded-xl border border-line-subtle bg-surface-sunken p-5 text-left hover:border-action/25 transition-all"
    : "group rounded-xl border border-surface-300 bg-white p-5 text-left hover:border-brand-500 hover:shadow-md transition-all";
  const cardTitleClasses = isDark
    ? "text-sm font-semibold text-primary mb-1"
    : "text-sm font-semibold text-ink-800 mb-1";
  const cardBodyClasses = isDark
    ? "text-xs text-muted"
    : "text-xs text-ink-600";
  const cardIconWrapClasses = isDark
    ? "mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-action/10 text-action"
    : "mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700";

  return (
    <div className="space-y-6">
      <div className={panelClasses}>
        {eyebrow ? <p className={eyebrowClasses}>{eyebrow}</p> : null}
        <h2 className={titleClasses}>{title}</h2>
        <p className={bodyClasses}>{body}</p>
        <Link href={primaryCta.href} className={primaryClasses}>
          {primaryCta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {cards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className={cardClasses}>
              <div className={cardIconWrapClasses}>
                <c.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className={cardTitleClasses}>{c.title}</p>
              <p className={cardBodyClasses}>{c.body}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyDashboardState;
