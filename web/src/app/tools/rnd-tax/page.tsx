import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { RndTaxCalculator } from "./rnd-tax-calculator";

const TITLE =
  "R&D Tax Incentive Calculator — Free Tool | BlockID.au";
const DESCRIPTION =
  "Calculate your estimated R&D Tax Incentive benefit for Australian startups. 43.5% refundable offset for small businesses, 38.5% for larger companies. Free calculator.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "R&D tax incentive calculator australia",
    "research development tax offset",
    "43.5 percent tax offset",
    "R&D tax refund calculator",
    "startup R&D tax benefit australia",
    "ATO R&D tax incentive",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/rnd-tax",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/rnd-tax",
  },
};

export default function RndTaxPage() {
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
              R&D Tax Incentive Calculator
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Estimate your R&D Tax Incentive benefit under the Australian
              Government scheme. Enter your turnover and R&D spend to see
              your estimated tax offset, net benefit, and potential runway
              impact.
            </p>
          </header>
          <div className="mt-10">
            <RndTaxCalculator />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
