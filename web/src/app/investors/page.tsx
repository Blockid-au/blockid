import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { BarChart3, FolderOpen, ShieldCheck, Eye } from "lucide-react";

export const metadata: Metadata = {
  title: "For Investors — BlockID",
  description:
    "Streamline due diligence, portfolio visibility, and compliance tracking with BlockID's investor tools.",
};

const features = [
  {
    icon: ShieldCheck,
    title: "Streamlined Due Diligence",
    body: "Access verified cap tables, financial models, and compliance documents through structured data rooms. Spend less time chasing paperwork and more time evaluating opportunities.",
  },
  {
    icon: Eye,
    title: "Portfolio Visibility",
    body: "Get a live view of your portfolio companies' ownership structures, dilution scenarios, and Startup Viability Index scores — all in one dashboard.",
  },
  {
    icon: FolderOpen,
    title: "Secure Data Rooms",
    body: "Founders share investor-ready data room links with granular access controls, watermarking, and audit trails. Everything you need, organised and verifiable.",
  },
  {
    icon: BarChart3,
    title: "Compliance Tracking",
    body: "Monitor ASIC filings, shareholder agreements, and regulatory milestones across your portfolio. Stay ahead of compliance requirements without manual follow-ups.",
  },
];

export default function InvestorsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold tracking-tight text-ink-800">
            For Investors
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            BlockID gives investors the clarity and confidence they need to
            back great Australian startups. From first look to portfolio
            management, our platform puts verified data at your fingertips.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-surface-200 bg-surface-100 p-6"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-ink-800">
                    {f.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    {f.body}
                  </p>
                </div>
              );
            })}
          </div>

          <section className="mt-16 rounded-xl border border-brand-500/20 bg-brand-600/5 p-8 text-center">
            <h2 className="text-2xl font-semibold text-ink-800">
              Want to learn more?
            </h2>
            <p className="mt-3 text-ink-600">
              We work with angel investors, VCs, and family offices across
              Australia. Get in touch to see how BlockID can support your deal
              flow and portfolio operations.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-500 transition-colors"
            >
              Get in Touch
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
