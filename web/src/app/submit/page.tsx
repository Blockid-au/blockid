// /submit — Public "Submit your startup" page (T-1301).
//
// Server component wrapper. MarketingShell provides the nav + footer.
// SubmitForm is a "use client" component imported as a child.

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SubmitForm } from "./submit-form";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Submit Your Startup | BlockID AU Startup Public Index",
  description:
    "List your Australian startup on the BlockID Startup Index™ — free, verified, and discoverable by investors and founders.",
  openGraph: {
    title: "Submit Your Startup | BlockID AU Startup Public Index",
    description:
      "Get your startup listed on the AU Startup Public Index. Free, verified profiles discoverable by AU investors.",
  },
};

export default function SubmitPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-10 text-center">
          <span className="inline-block rounded-full border border-action/40 bg-action/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-action mb-4">
            BlockID Startup Index™
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-strong sm:text-4xl">
            List your startup on the{" "}
            <span className="text-action">AU Public Index</span>
          </h1>
          <p className="mt-4 text-base text-secondary max-w-xl mx-auto">
            Get discovered by Australian investors, partners, and fellow founders.
            Verified profiles rank higher. Free to submit — live within 24 hours.
          </p>
        </div>

        {/* Trust signals */}
        <div className="mb-10 grid grid-cols-3 gap-4 text-center">
          {[
            { stat: "Free",     sub: "No cost, ever" },
            { stat: "24 hrs",   sub: "Review turnaround" },
            { stat: "AU-only",  sub: "Curated index" },
          ].map(({ stat, sub }) => (
            <div
              key={stat}
              className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-4"
            >
              <p className="text-xl font-bold text-strong">{stat}</p>
              <p className="text-xs text-secondary mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 sm:p-8 shadow-xl">
          <SubmitForm />
        </div>

        {/* Fine print */}
        <p className="mt-6 text-xs text-center text-secondary">
          By submitting you agree to the{" "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-primary">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-primary">
            Privacy Policy
          </Link>
          . Already have a BlockID account?{" "}
          <a href="/login" className="underline underline-offset-2 hover:text-primary">
            Sign in to claim your profile.
          </a>
        </p>
      </section>
    </MarketingShell>
  );
}
