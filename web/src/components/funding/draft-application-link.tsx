"use client";

/**
 * "Draft application (credits)" link for the statically rendered grant /
 * program detail pages (S16-A). The pages are ISR (no cookies), so the link
 * resolves who is signed in after hydration via `useAuthUser` — guests see
 * nothing (the official link beside it is always there), signed-in founders
 * get the same `/workspace/funding?draft=<id>&kind=<kind>` door the report
 * cards use. Renders nothing while auth is resolving so the section never
 * flashes a link at a guest.
 */

import Link from "next/link";
import { PenLine } from "lucide-react";
import { useAuthUser } from "@/hooks/useAuthUser";
import type { DraftKind } from "@/lib/funding/application-prompts";
import { FUNDING_COPY } from "@/lib/funding/copy";

export interface DraftApplicationLinkProps {
  /** `au_grants.id` or `au_programs.id`. */
  refId: string;
  kind: DraftKind;
  className?: string;
}

export function draftHref(refId: string, kind: DraftKind): string {
  return `/workspace/funding?draft=${encodeURIComponent(refId)}&kind=${kind}`;
}

export function DraftApplicationLink({ refId, kind, className }: DraftApplicationLinkProps) {
  const user = useAuthUser();
  if (!user) return null;
  return (
    <Link
      href={draftHref(refId, kind)}
      className={className ?? "inline-flex h-10 items-center gap-1.5 rounded-full bg-action px-5 text-on-action hover:opacity-90"}
      data-draft={refId}
      data-draft-kind={kind}
    >
      <PenLine aria-hidden="true" className="h-3.5 w-3.5" />
      {FUNDING_COPY.cta.draftApplication}
    </Link>
  );
}

export default DraftApplicationLink;
