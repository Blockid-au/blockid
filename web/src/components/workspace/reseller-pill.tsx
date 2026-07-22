"use client";

// Topbar co-branding pill — renders "Powered by BlockID · Introduced by
// {reseller.display_name}" when the current user has an active reseller
// attribution. Wording matches docs/plans/reseller-module-plan.md § C.3.
//
// Rendered null when:
//   - useResellerAttribution() is still loading (avoids flash)
//   - no attribution present
//   - reseller marked inactive server-side
//
// Per docs/plans/reseller-module-plan.md § P5 co-branding. Sits between
// ProjectSwitcher and ConnectWalletButton in the topbar.

import * as React from "react";

import { useResellerAttribution } from "@/hooks/useResellerAttribution";
import { useLocale, type Locale } from "@/lib/use-locale";

const COPY: Record<Locale, { title: string; via: string }> = {
  en: { title: "Introduced by", via: "via" },
  vi: { title: "Được giới thiệu bởi", via: "qua" },
};

export function ResellerPill(): React.ReactElement | null {
  const [locale] = useLocale();
  const { reseller, isLoading } = useResellerAttribution();
  if (isLoading || !reseller) return null;

  const brandColor = reseller.primary_color ?? "#3B7DD8";
  const copy = COPY[locale];

  return (
    <div
      className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium text-ink-700 bg-surface-100 ring-1 ring-surface-200"
      title={`${copy.title} ${reseller.display_name}`}
    >
      {reseller.logo_url ? (
        <img
          src={reseller.logo_url}
          alt=""
          className="h-4 w-4 rounded-sm object-contain"
        />
      ) : (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: brandColor }}
          aria-hidden
        />
      )}
      <span className="text-ink-500">{copy.via}</span>
      <span className="text-ink-800">{reseller.display_name}</span>
    </div>
  );
}
