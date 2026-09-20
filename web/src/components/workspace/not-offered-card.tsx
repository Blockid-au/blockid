// <NotOfferedCard> — the ONE card a hidden feature renders (G20-F1, 2026-09-20).
//
// "Ready for sale" rule (docs/plans/g20-ready-for-sale-2026-09-20.md § 2.2):
// every feature a customer can reach either works end-to-end on production
// or is hidden — nav row removed, route answers a clean "not offered" page,
// no CTA points at it. The hidden list lives in `lib/features/hidden.ts`;
// each hidden page mounts this card instead of its half-built UI.
//
// The card never promises a date, never sells an upgrade and never names a
// retired plan. It offers what exists today and one honest next step: talk
// to us (`/contact?topic=sales&feature=<key>` — the contact form carries
// `feature` on the lead so the founder sees which hidden surface was asked
// for). Server-safe: no hooks, no fetch — a hidden page must stay cheap.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { MessageSquare } from "lucide-react";

/** Literal the guard test allow-lists (and the card's own test pins). */
export const NOT_OFFERED_LABEL = "Not offered yet";

export interface NotOfferedAlternative {
  href: string;
  label: string;
}

export interface NotOfferedCardProps {
  /** `HIDDEN_FEATURES[].key` — becomes `?feature=` on the contact link and `data-feature`. */
  feature: string;
  title: string;
  /** One or two sentences: what it would do, and why it is not offered. */
  reason: string;
  icon?: LucideIcon;
  /** Things that exist today and cover part of the need. */
  alternatives?: NotOfferedAlternative[];
  /** Where the "Back" link goes. Defaults to /workspace. */
  backHref?: string;
  backLabel?: string;
  /**
   * Heading element. A standalone page keeps the default `h1`; a card
   * composed into a hub tab passes `h2` (+ `headingId`) so the page keeps a
   * single h1.
   */
  headingLevel?: "h1" | "h2";
  headingId?: string;
  /** Locale of the surrounding page (VI mirrors pass "vi"). */
  locale?: "en" | "vi";
}

const COPY = {
  en: {
    label: NOT_OFFERED_LABEL,
    today: "What you can use today",
    talk: "Talk to us",
    back: "Back to Workspace",
  },
  vi: {
    label: "Chưa cung cấp",
    today: "Bạn có thể dùng ngay hôm nay",
    talk: "Liên hệ với chúng tôi",
    back: "Về Workspace",
  },
} as const;

/** The contact link every card renders — pinned by the test. */
export function contactHrefForFeature(feature: string): string {
  return `/contact?topic=sales&feature=${encodeURIComponent(feature)}`;
}

export function NotOfferedCard({
  feature,
  title,
  reason,
  icon: Icon,
  alternatives = [],
  backHref = "/workspace",
  backLabel,
  headingLevel: Heading = "h1",
  headingId,
  locale = "en",
}: NotOfferedCardProps) {
  const t = COPY[locale];
  return (
    <div className="mx-auto max-w-2xl p-6" data-testid="not-offered-card" data-feature={feature}>
      <div className="mb-8 text-center">
        {Icon ? (
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
            <Icon className="h-7 w-7 text-action" aria-hidden="true" />
          </div>
        ) : null}
        <Heading id={headingId} className="scroll-mt-24 text-2xl font-bold text-primary">
          {title}
        </Heading>
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-6 shadow-1">
        <p className="text-sm font-semibold text-primary">{t.label}</p>
        <p className="mt-2 text-sm text-secondary">{reason}</p>

        {alternatives.length > 0 ? (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">{t.today}</p>
            <ul className="mt-2 space-y-1.5">
              {alternatives.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="text-sm font-medium text-action underline-offset-4 hover:underline">
                    {a.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={contactHrefForFeature(feature)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {t.talk}
          </Link>
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
          >
            {backLabel ?? t.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
