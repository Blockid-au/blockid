import type { Metadata } from "next";
import { EsopChecklistClient } from "./esop-checklist-client";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";

const TITLE = "ESOP Legal Checklist for Australian Startups 2026 | BlockID";
const DESCRIPTION =
  "Free interactive ESOP legal checklist for AU founders. Covers pre-implementation, plan documentation, ESS tax rules, ASIC compliance, employee communication, and ongoing obligations. Updated June 2026.";
const CANONICAL = "https://blockid.au/tools/esop-checklist";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "esop australia startup",
    "employee share option plan australia",
    "esop legal checklist",
    "ess part 7a",
    "startup equity australia 2026",
    "option pool australian startups",
    "esop vesting schedule australia",
    "antler esop requirements",
    "asic esop compliance",
    "esop tax compliance australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
  },
  alternates: { canonical: CANONICAL },
};

export default function EsopChecklistPage() {
  return (
    <>
      <PageTracker page="esop-checklist" />
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-surface-50 to-white">
        <EsopChecklistClient />
      </main>
      <Footer />
    </>
  );
}
