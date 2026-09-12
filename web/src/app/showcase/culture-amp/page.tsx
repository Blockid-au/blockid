// /showcase/culture-amp — Case study: Culture Amp (Melbourne HR-tech
// unicorn, private). Public-record facts only — every figure carries its
// source; see web/src/lib/showcase/public-record/cases.ts (real-world
// workflow parity audit #6, S19-B).

import type { Metadata } from "next";

import { PublicRecordShowcase } from "@/components/showcase/public-record-showcase";
import { pageMetadata } from "@/lib/seo/page-meta";
import { CULTURE_AMP_CASE } from "@/lib/showcase/public-record/cases";

export const metadata: Metadata = pageMetadata({
  title: "Culture Amp showcase — public-record journey",
  description:
    "Culture Amp from a Melbourne founding to a unicorn Series F, every round with its public source, mapped to BlockID journey phases with an illustrative SVI band.",
  path: "/showcase/culture-amp",
});

export const dynamic = "force-dynamic";

export default function CultureAmpShowcasePage() {
  return <PublicRecordShowcase c={CULTURE_AMP_CASE} />;
}
