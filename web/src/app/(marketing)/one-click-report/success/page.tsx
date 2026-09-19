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
 * G17 P2-A: on the unicorn template (PageHero → CtaBand) inside
 * MarketingShell; noindex.
 *
 * Server component. No client state required.
 */
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero } from "@/components/marketing/template";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ObfuscatedEmail } from "@/components/marketing/obfuscated-email";

export const metadata: Metadata = pageMetadata({
  title: "Payment received — report on the way",
  description:
    "Your BlockID one-click investor report is being generated and will arrive by email in 1 to 3 minutes. Check your spam folder or email support if it does not.",
  path: "/one-click-report/success",
  index: false,
});

export default function OneClickSuccessPage() {
  return (
    <MarketingShell>
      <PageTracker page="one_click_report_success" tool="one_click_report" />
      <PageHero
        eyebrow="Payment received"
        title="Payment received. Report on the way."
        sub={
          <>
            Your report is being generated and will arrive in your inbox in{" "}
            <span className="font-semibold text-primary">1 to 3 minutes</span>. You can safely close this page.
          </>
        }
        footnote={
          <>
            Trouble? Check your spam folder, or email{" "}
            <ObfuscatedEmail user="support" domain="blockid.au" href className="text-action underline underline-offset-2" />{" "}
            and we&apos;ll re-send it.
          </>
        }
      />
      <CtaBand
        title="Meanwhile — create a free account"
        sub="Save your report, track your SVI over time, and unlock deeper analysis. No credit card required."
        primary={{ href: "/signup", label: "Create free account", ctaId: "ocr_success_signup" }}
        secondary={{ href: "/product", label: "How the score works" }}
      />
    </MarketingShell>
  );
}
