// <HiddenWorkspacePage> — the whole body of a hidden signed-in page (G20-F1).
//
// A page in `HIDDEN_FEATURES` keeps its route (bookmarks, e-mails and the
// legacy redirects still resolve) but its default export becomes
//
//   export default () => <HiddenWorkspacePage feature="…" path="…" title="…" … />
//
// which authenticates, mounts the workspace shell and renders the shared
// <NotOfferedCard>. `reason` is the customer-facing sentence; the technical
// reason (why it is hidden, what would make it sellable) lives on the
// `HIDDEN_FEATURES` row and in docs/ops/feature-inventory.md. The route must
// be listed there — `assertHidden` throws at render otherwise so a page can
// never claim the card while still being advertised in nav / sitemap.

import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { hiddenFeature, isHiddenRoute } from "@/lib/features/hidden";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { NOT_OFFERED_LABEL, NotOfferedCard, type NotOfferedAlternative } from "@/components/workspace/not-offered-card";

export interface HiddenWorkspacePageProps {
  /** `HIDDEN_FEATURES[].key`. */
  feature: string;
  /** The page's own pathname — login `next=` target and the hidden-route assertion. */
  path: string;
  title: string;
  reason: string;
  icon?: LucideIcon;
  alternatives?: NotOfferedAlternative[];
  backHref?: string;
  backLabel?: string;
}

/** Throws when a page mounts the card without being in `HIDDEN_FEATURES` (programmer error, caught by tests). */
export function assertHidden(feature: string, path: string): void {
  if (!hiddenFeature(feature)) throw new Error(`hidden page: unknown feature key "${feature}" — add it to lib/features/hidden.ts`);
  if (!isHiddenRoute(path)) throw new Error(`hidden page: ${path} is not covered by HIDDEN_FEATURES["${feature}"].routes`);
}

/** Metadata every hidden page exports — noindex, plain title. */
export function hiddenPageMetadata(title: string): Metadata {
  return {
    title: `${title} | BlockID`,
    description: `${title} — ${NOT_OFFERED_LABEL.toLowerCase()}. Talk to us.`,
    robots: { index: false, follow: false },
  };
}

export async function HiddenWorkspacePage({ feature, path, title, reason, icon, alternatives, backHref, backLabel }: HiddenWorkspacePageProps) {
  assertHidden(feature, path);
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(path)}`);
  const isSandbox = await getCurrentProjectIsSandbox();
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <NotOfferedCard
        feature={feature}
        title={title}
        reason={reason}
        icon={icon}
        alternatives={alternatives}
        backHref={backHref}
        backLabel={backLabel}
      />
    </WorkspaceLayout>
  );
}
