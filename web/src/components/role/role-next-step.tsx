"use client";

/**
 * Role-aware "Recommended next step" card.
 *
 * Reads `ROLE_GUIDING_COPY[role].next_step_recommender` and renders the
 * phrase + CTA link. Callers pass the role explicitly (rather than inferring
 * from an auth session) so this stays a pure presentational component that
 * works on any route.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import { useLocale } from "@/lib/use-locale";
import { ROLE_GUIDING_COPY } from "@/lib/roles/role-guiding-copy";
import type { Role } from "@/lib/roles/role-taxonomy";

interface Props {
  role: Role;
  /** Optional tighter styling for use inside sidebar cards. */
  variant?: "card" | "inline";
}

export function RoleNextStep({
  role,
  variant = "card",
}: Props): React.ReactElement | null {
  const [locale] = useLocale();
  const spec = ROLE_GUIDING_COPY[role];
  if (!spec) return null;

  const rec = spec.next_step_recommender;
  const label = rec.cta.label[locale] ?? rec.cta.label.en;
  const phrase = rec.phrase[locale] ?? rec.phrase.en;

  if (variant === "inline") {
    return (
      <p
        className="text-xs text-ink-600 dark:text-ink-300"
        data-testid={`role-next-step-${role}`}
      >
        {phrase}{" "}
        <Link
          href={rec.cta.href}
          className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300"
        >
          {label}
        </Link>
      </p>
    );
  }

  return (
    <aside
      role="note"
      data-testid={`role-next-step-${role}`}
      className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm dark:border-amber-800/40 dark:bg-amber-900/20"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-800/60 dark:text-amber-200">
          <Compass className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-ink-800 dark:text-ink-100">{phrase}</p>
          <Link
            href={rec.cta.href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
          >
            {label}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </aside>
  );
}
