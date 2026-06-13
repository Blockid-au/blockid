import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ASICChecker } from "./asic-checker";

const TITLE = "ASIC Compliance Checker — Free Tool for Australian Startups";
const DESCRIPTION =
  "Check your Australian startup's ASIC compliance status. Verify you meet all Corporations Act 2001 requirements — ABN, ACN, annual review, directors, share register, financial records, and more.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "ASIC compliance checker",
    "ASIC startup Australia",
    "Corporations Act compliance",
    "ABN ACN requirements",
    "Australian company compliance",
    "proprietary limited compliance",
    "ASIC annual review",
    "startup legal requirements Australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/asic",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/asic",
  },
};

export default function ASICPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU compliance
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              ASIC Compliance Checker
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Verify your Australian startup meets its obligations under the{" "}
              <span className="font-semibold">Corporations Act 2001</span>.
              Check all ASIC requirements — from ABN/ACN registration to annual
              reviews, share registers, and financial records.
            </p>
          </header>

          {/* Context */}
          <div className="mt-8 rounded-2xl bg-surface-50 border border-surface-200 p-5">
            <p className="text-xs uppercase tracking-[0.15em] font-semibold text-ink-400 mb-2">
              Why this matters
            </p>
            <ul className="space-y-1.5 text-sm text-ink-600">
              <li>
                ✅ ASIC can deregister companies that fail to pay their annual
                review fee
              </li>
              <li>
                ✅ Directors personally liable for insolvent trading — solvency
                records protect you
              </li>
              <li>
                ✅ Investors and VCs verify ASIC status during due diligence
              </li>
              <li>
                ✅ Non-compliance can block ESIC eligibility and R&amp;D tax
                offsets
              </li>
            </ul>
          </div>

          <div className="mt-10">
            <ASICChecker />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
