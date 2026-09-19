/**
 * /legal — index of BlockID.au legal documents.
 *
 * The workspace footer and other surfaces link to a bare `/legal` path. The
 * individual documents already live under `/legal/[doc]` (terms, privacy,
 * disclaimers) and `/legal/acceptable-use`. This page lists them so the link
 * never 404s and lets crawlers discover the full set.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { FileText, Lock, ScrollText, ShieldAlert, type LucideIcon } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/marketing/template";

export const metadata: Metadata = pageMetadata({
  title: "Legal — terms, privacy and disclaimers",
  description: "BlockID.au legal documents — Terms of Service, Privacy Policy, Acceptable Use Policy, and canonical disclaimers.",
  path: "/legal",
});

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

const DOC_ICONS: Record<string, LucideIcon> = {
  "/legal/terms": ScrollText,
  "/legal/privacy": Lock,
  "/legal/acceptable-use": ShieldAlert,
  "/legal/disclaimers": FileText,
};

export default function LegalIndexPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Legal"
        title="Legal documents"
        sub="The authoritative Auschain PTY LTD policies that govern how BlockID.au is used."
        align="start"
      />

      <Section id="documents" ariaLabel="Legal documents" tone="sunken">
        <FeatureGrid
          columns={2}
          ariaLabel="Legal documents"
          items={DOCS.map((d) => ({ icon: DOC_ICONS[d.href] ?? FileText, title: d.title, body: d.body, href: d.href, cta: "Read" }))}
        />
      </Section>

      <CtaBand
        title="Questions about our legal position?"
        sub="Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW."
        primary={{ href: "/contact?topic=legal", label: "Contact legal", ctaId: "legal_final_contact" }}
        secondary={{ href: "/legal/acceptable-use", label: "Acceptable use" }}
      />
    </MarketingShell>
  );
}
