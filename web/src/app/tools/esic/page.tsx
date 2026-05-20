import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ESICChecker } from "./esic-checker";

const TITLE =
  "ESIC Eligibility Checker — Free Tool | BlockID.au";
const DESCRIPTION =
  "Check if your startup qualifies as an Early Stage Innovation Company (ESIC) for Australian tax incentives. Free eligibility checker — 20% tax offset + CGT exemption for investors.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "ESIC eligibility checker",
    "early stage innovation company",
    "ESIC tax incentive australia",
    "startup tax offset australia",
    "CGT exemption startup investors",
    "ESIC 100 point test",
    "ESIC early stage test",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/esic",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/esic",
  },
};

export default function ESICPage() {
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
              ESIC Eligibility Checker
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Check if your startup qualifies as an Early Stage Innovation
              Company (ESIC) under Australian tax law. ESIC status unlocks a 20%
              tax offset and CGT exemption for your investors.
            </p>
          </header>
          <div className="mt-10">
            <ESICChecker />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
