// <ForOrganisationsCard> — what a solo / Free evaluator (or an invited seat)
// sees on the institutional admin tabs (G21 P3-B: /workspace/settings/audit
// organisation export, /workspace/settings/retention). The feature exists
// and works; it is managed by the OWNER of an organisation — a Program /
// Fund organisation, or a team with seats. Server-safe: no hooks.

import Link from "next/link";
import { Building2 } from "lucide-react";

export type ForOrganisationsReason = "individual" | "not_owner" | "no_org";

const REASON_COPY: Record<ForOrganisationsReason, string> = {
  individual: "This setting is managed by the owner of an organisation — a Program or Fund organisation, or a team with invited seats. Your account is a single evaluator seat today.",
  not_owner: "This setting is managed by the owner of your organisation. Ask them to change it, or export from your own audit log below.",
  no_org: "This setting is managed by the owner of an organisation — a Program or Fund organisation, or a team with invited seats.",
};

export function ForOrganisationsCard({ feature, title, reason, headingId }: { feature: "audit_export" | "retention"; title: string; reason: ForOrganisationsReason; headingId?: string }) {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm" data-testid="for-organisations-card" data-feature={feature} data-reason={reason} aria-labelledby={headingId}>
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
          <Building2 className="h-5 w-5 text-brand-700" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">For organisations</p>
          <h2 id={headingId} className="mt-1 text-lg font-bold text-ink-800">
            {title}
          </h2>
          <p className="mt-2 text-sm text-ink-600">{REASON_COPY[reason]}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/workspace/investor/team" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              Invite seats to your team →
            </Link>
            <Link href="/pricing?segment=evaluator" className="font-medium text-brand-700 underline-offset-4 hover:underline">
              Program and Fund plans →
            </Link>
            <Link href="/developers/api#institutional" className="font-medium text-ink-600 underline-offset-4 hover:underline">
              What organisations get
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
