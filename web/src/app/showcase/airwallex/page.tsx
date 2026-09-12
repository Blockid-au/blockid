// /showcase/airwallex — Case study: Airwallex (Melbourne-founded fintech,
// still private after a Series H). Public-record facts only — every figure
// carries its source; see web/src/lib/showcase/public-record/cases.ts
// (real-world workflow parity audit #6, S19-B).

import type { Metadata } from "next";

import { PublicRecordShowcase } from "@/components/showcase/public-record-showcase";
import { pageMetadata } from "@/lib/seo/page-meta";
import { AIRWALLEX_CASE } from "@/lib/showcase/public-record/cases";

export const metadata: Metadata = pageMetadata({
  title: "Airwallex showcase — public-record journey",
  description:
    "Airwallex from a Melbourne founding to a Series H, every round with its public source, mapped to the BlockID journey phases with an illustrative SVI band.",
  path: "/showcase/airwallex",
});

export const dynamic = "force-dynamic";

export default function AirwallexShowcasePage() {
  return <PublicRecordShowcase c={AIRWALLEX_CASE} />;
}
