import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ESICChecker } from "./esic-checker";

const TITLE =
  "ESIC Eligibility Checker — Free Tool";
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
              Unlock the 20% ESIC tax offset for your investors
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Investors get a big carrot when your startup qualifies as ESIC —
              confirm eligibility in minutes and cite it in your raise. ESIC
              status under Australian tax law unlocks a 20% tax offset and CGT
              exemption for your investors.
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
