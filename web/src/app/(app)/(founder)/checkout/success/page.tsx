import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import {
  ONBOARDING_RETURN_STEP_URL,
  shouldReturnToOnboarding,
} from "@/lib/stripe/checkout-success-url";
import { CheckoutTracker } from "./checkout-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Confirmed | BlockID",
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; onboarding?: string }>;
}) {
  const sp = await searchParams;
  const planId = sp.plan ?? "founding50";
  const plan = getPlan(planId);
  const user = await getCurrentUser();

  // Iteration-6 task #2: when the Stripe-hosted checkout was initiated from
  // the onboarding wizard (`?onboarding=1`, stamped by the checkout route
  // when POST body had origin:"onboarding") and the user is signed in,
  // bounce them straight back into the wizard at Step 6 ("Create your first
  // startup"). Anon users still see the sign-in CTA below so the purchase
  // can be linked to an account first.
  if (shouldReturnToOnboarding(sp.onboarding, Boolean(user))) {
    redirect(ONBOARDING_RETURN_STEP_URL);
  }

  const planName = plan?.name ?? "BlockID";
  const features = plan?.features ?? [];

  return (
    <>
      <CheckoutTracker plan={planId} />
      <Navbar />
      <main className="min-h-screen bg-surface-100 pt-28 pb-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
        {/* Checkmark */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="h-12 w-12 text-emerald-600" />
        </div>

        <h1 className="mt-8 text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
          Payment Confirmed!
        </h1>
        <p className="mt-3 text-lg text-ink-600">
          Thank you for joining the{" "}
          <span className="font-semibold text-brand-600">{planName}</span> plan.
        </p>

        {/* Plan details card */}
        {features.length > 0 && (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-surface-200 bg-white p-6 text-left shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
              What&apos;s included
            </p>
            <ul className="mt-4 space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-sm text-ink-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {user ? (
            <Link href="/dashboard/svi">
              <Button variant="primary" size="lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/auth/login?next=/dashboard/svi">
              <Button variant="primary" size="lg">
                Sign in to activate your account
              </Button>
            </Link>
          )}
          <Link href="/#svi">
            <Button variant="secondary" size="lg">
              Get Your First SVI Score
            </Button>
          </Link>
        </div>

        {/* Signed-in status hint */}
        {!user && (
          <p className="mt-6 text-sm text-ink-500">
            If you already have an account, sign in to link this purchase
            automatically.
          </p>
        )}
        </div>
      </main>
      <Footer />
    </>
  );
}
