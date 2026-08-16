/**
 * /legal — index of BlockID.au legal documents.
 *
 * The workspace footer and other surfaces link to a bare `/legal` path. The
 * individual documents already live under `/legal/[doc]` (terms, privacy,
 * disclaimers) and `/legal/acceptable-use`. This page lists them so the link
 * never 404s and lets crawlers discover the full set.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "Legal — BlockID.au",
  description:
    "BlockID.au legal documents — Terms of Service, Privacy Policy, Acceptable Use Policy, and canonical disclaimers.",
  alternates: { canonical: `${SITE_URL}/legal` },
  robots: { index: true, follow: true },
};

interface LegalDoc {
  href: string;
  title: string;
  body: string;
}

const DOCS: LegalDoc[] = [
  {
    href: "/legal/terms",
    title: "Terms of Service",
    body: "Auschain PTY LTD Terms of Service governing use of the BlockID.au platform.",
  },
  {
    href: "/legal/privacy",
    title: "Privacy Policy",
    body: "How Auschain PTY LTD collects, holds, uses, and discloses personal information under the Privacy Act 1988 (Cth).",
  },
  {
    href: "/legal/acceptable-use",
    title: "Acceptable Use Policy",
    body: "Rules that apply to every user of BlockID.au, including reseller admins in sandbox workspaces.",
  },
  {
    href: "/legal/disclaimers",
    title: "Legal disclaimers",
    body: "Canonical disclaimers surfaced across BlockID.au — advice, wholesale, equity offer, share issuance, trial, and more.",
  },
];

export default function LegalIndexPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Legal"
        title="Legal documents"
        subtitle="The authoritative Auschain PTY LTD policies that govern how BlockID.au is used."
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 pb-16">
        <ul className="space-y-4">
          {DOCS.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="block rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 transition-colors hover:border-[var(--fintech-accent)]"
              >
                <h2 className="text-lg font-semibold text-[var(--fintech-ink)]">
                  {d.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                  {d.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <MarketingCtaStrip
        headline="Questions about our legal position?"
        primary={{ href: "/contact?topic=legal", label: "Contact legal" }}
        secondary={{ href: "/legal/acceptable-use", label: "Acceptable use" }}
      />
    </MarketingShell>
  );
}
