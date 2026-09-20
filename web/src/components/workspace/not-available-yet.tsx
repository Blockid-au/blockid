// <NotAvailableYet> — compatibility wrapper over <NotOfferedCard> (G20-F1,
// 2026-09-20).
//
// S31-B (2026-09-13) introduced this card for the deferred surfaces (SSO,
// White-label, Weekly Digest, the listing form). G20 "ready for sale" folds
// every hidden surface onto ONE card — `not-offered-card.tsx` — whose copy
// is "Not offered yet" + "Talk to us" (`/contact?topic=sales&feature=…`)
// instead of a notify-me lead. Pages the G19 lane owns
// (`workspace/score/listing`) still import this name, so it stays as a
// prop-compatible alias; new hidden pages import <NotOfferedCard> directly.
//
// `userEmail` is accepted and ignored (the contact form asks for it).

import type { LucideIcon } from "lucide-react";
import { NotOfferedCard } from "./not-offered-card";

/** Kept for the lead-source consumers (`/api/lead` filter, admin leads). */
export const FEATURE_INTEREST_SOURCE = "feature_interest";

export interface NotAvailableYetAlternative {
  href: string;
  label: string;
}

export interface NotAvailableYetProps {
  feature: string;
  title: string;
  reason: string;
  /** Unused since G20-F1 — the contact form collects the address. */
  userEmail?: string;
  icon?: LucideIcon;
  alternatives?: NotAvailableYetAlternative[];
  backHref?: string;
  backLabel?: string;
  headingLevel?: "h1" | "h2";
  headingId?: string;
}

export function NotAvailableYet({ userEmail: _userEmail, ...rest }: NotAvailableYetProps) {
  void _userEmail;
  return <NotOfferedCard {...rest} />;
}
