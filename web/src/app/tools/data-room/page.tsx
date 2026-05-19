import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { DataRoomChecklist } from "./data-room-checklist";
import { Building2, FileCheck2, ShieldCheck } from "lucide-react";

const TITLE =
  "Fundraising Data Room Checklist (Australia) — Investor-Ready Pack | BlockID";
const DESCRIPTION =
  "Build an investor-ready data room for an Australian seed or Series A raise. Track corporate, cap table, financing, governance, financial, tax and legal readiness.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup data room checklist australia",
    "fundraising data room",
    "investor due diligence checklist",
    "seed round documents australia",
    "series a due diligence australia",
    "startup legal documents australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/data-room",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/data-room",
  },
};

const POINTS = [
  {
    icon: Building2,
    title: "AU-native diligence structure",
    body: "Corporate identity, ASIC hygiene, share register, ESOP, financing docs, tax and IP in one founder-friendly checklist.",
  },
  {
    icon: FileCheck2,
    title: "Readiness impact per item",
    body: "Every missing item shows investor impact, owner and why it matters before the first diligence request lands.",
  },
  {
    icon: ShieldCheck,
    title: "Built for the Score v2 path",
    body: "The checklist is the data layer for future Score confidence, proof records and Fundraising Readiness Report exports.",
  },
];

export default function DataRoomPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-7xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Free tool · No login · AU seed-to-Series-A
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Fundraising Data Room Checklist
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              See what investors will ask for before they ask. Track the
              documents, approvals and evidence behind a clean Australian
              startup raise.
            </p>
          </header>

          <section className="mt-10 grid md:grid-cols-3 gap-6">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <article
                  key={point.title}
                  className="rounded-2xl border border-surface-200 bg-white p-6"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 bg-surface-100 text-brand-600">
                    <Icon strokeWidth={1.75} className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-ink-800">
                    {point.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-400">
                    {point.body}
                  </p>
                </article>
              );
            })}
          </section>

          <div className="mt-10">
            <DataRoomChecklist />
          </div>

          <p className="mt-8 max-w-3xl text-xs leading-relaxed text-ink-8000">
            This checklist is analysis support, not legal, tax or financial
            advice. Use your lawyer and accountant for binding fundraising,
            ESIC, R&D Tax Incentive and ASIC decisions.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
