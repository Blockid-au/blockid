// /auth/reset?token=… — choose a new password (release QA-4 P2-d).
//
// Landing page for the single-use link POST /api/auth/reset-password emails.
// The token is read from the query string and posted with the new password
// to /api/auth/reset-password/confirm, which rotates the hash. Nothing about
// the account changes until that POST succeeds.

import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Reset your password · BlockID",
  description: "Choose a new password for your BlockID account.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const safeToken = typeof token === "string" ? token.trim() : "";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-surface-100 text-ink-800 flex items-center justify-center px-6 pt-28 pb-16">
        <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 shadow-sm">
          <p className="text-[11px] tracking-[0.2em] uppercase text-brand-600 font-medium mb-4">
            BlockID<span className="text-gold-600">.au</span>
          </p>
          <h1 className="text-xl font-semibold text-ink-800 mb-1">Choose a new password</h1>
          <p className="text-xs text-ink-500 mb-5">
            The link you followed is single-use and expires 30 minutes after it was requested.
            Your current password keeps working until you submit a new one here.
          </p>

          {safeToken ? (
            <ResetPasswordForm token={safeToken} />
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800 font-medium">This reset link is missing its token.</p>
              <p className="text-[11px] text-amber-700 mt-1">
                Open the link from the email again, or{" "}
                <Link href="/auth/login" className="underline">request a new one</Link>.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
