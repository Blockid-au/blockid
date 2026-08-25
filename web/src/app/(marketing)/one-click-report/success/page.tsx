/**
 * /one-click-report/success — post-checkout confirmation page.
 *
 * Stripe redirects here after a successful A$3 guest checkout, appending
 * `?session_id=<checkout_session_id>`. We deliberately do NOT block on that
 * value — the Stripe webhook is the source of truth for report generation,
 * and this page's job is simply to reassure the visitor that (a) payment was
 * received and (b) the email is on its way. Aligns with the "one-click →
 * close tab" UX.
 *
 * Server component. No client state required.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { Button } from "@/components/ui/button";
import { ArrowRight, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Payment received — Report on the way | BlockID.au",
  description:
    "Your BlockID one-click investor report is being generated and will arrive by email in 1 to 3 minutes.",
  robots: { index: false, follow: false },
};

export default function OneClickSuccessPage() {
  return (
    <>
      <PageTracker page="one_click_report_success" tool="one_click_report" />
      <Navbar />
      <main
        id="main"
        className="flex-1 pt-32 md:pt-40 pb-24 bg-surface-50"
      >
        <section className="mx-auto max-w-2xl px-6">
          <div className="rounded-3xl border border-surface-200 bg-white p-8 md:p-10 text-center shadow-sm">
            <div
              aria-hidden
              className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700"
            >
              <Mail strokeWidth={1.75} className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight text-ink-900">
              Payment received. Report on the way.
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Your report is being generated and will arrive in your inbox in{" "}
              <span className="font-semibold text-ink-800">
                1 to 3 minutes
              </span>
              . You can safely close this page.
            </p>
            <p className="mt-3 text-sm text-ink-500 leading-relaxed">
              Trouble? Check your spam folder, or email{" "}
              <a
                href="mailto:support@blockid.au"
                className="text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                support@blockid.au
              </a>{" "}
              and we&apos;ll re-send it.
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 md:p-8 text-center">
            <h2 className="text-lg md:text-xl font-semibold text-ink-900">
              Meanwhile — create a free account
            </h2>
            <p className="mt-2 text-sm md:text-base text-ink-600">
              Save your report, track your SVI over time, and unlock deeper
              analysis. No credit card required.
            </p>
            <div className="mt-5 flex justify-center">
              <Link href="/signup" className="inline-flex">
                <Button variant="primary" size="lg">
                  Create free account
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
