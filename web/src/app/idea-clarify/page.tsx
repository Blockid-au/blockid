// /idea-clarify — short-URL alias for the canonical tool at
// /tools/idea-clarify.
//
// The canonical page lives at /tools/idea-clarify (see src/app/tools/
// idea-clarify/page.tsx). Founders sometimes type the shorter URL, and
// some external marketing links dropped the /tools/ prefix; those
// requests would 404 without this alias. Server-side redirect keeps the
// canonical URL in sitemap.ts and preserves the tool's SEO metadata.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "First-Principles Idea Clarifier — Free Founder Tool",
  description:
    "Answer 5–7 Socratic questions about your startup idea and get routed to the right next step — SVI analysis, cap table, ESIC eligibility, or fundraise prep. Free, no login required.",
  alternates: {
    canonical: "https://blockid.au/tools/idea-clarify",
  },
  robots: { index: false, follow: true },
};

export default function IdeaClarifyAliasPage(): never {
  redirect("/tools/idea-clarify");
}
