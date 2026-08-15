import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { LoginForm } from "./login-form";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const metadata: Metadata = {
  title: "Sign in · BlockID",
  description: "Sign in to your BlockID account with Google or a magic link.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; plan?: string }>;
}) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const nextUrl = sp.next ?? "/dashboard";

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-surface-100 text-ink-800 flex items-center justify-center px-6 pt-28 pb-16">
        <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 shadow-sm">
          <p className="text-[11px] tracking-[0.2em] uppercase text-brand-600 font-medium mb-4">
            BlockID<span className="text-gold-600">.au</span>
          </p>

          {user ? (
            /* ── Already signed in — show identity + options ── */
            <div className="space-y-5">
              {/* Status indicator */}
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-800">You&apos;re already signed in</p>
                  <p className="text-xs text-ink-500 mt-0.5">Your session is active and secure.</p>
                </div>
              </div>

              {/* User card */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 flex items-center gap-3">
                {/* Avatar circle */}
                <div className="h-10 w-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(user.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  {user.displayName && (
                    <p className="text-sm font-semibold text-ink-800 truncate">{user.displayName}</p>
                  )}
                  <p className="text-xs text-ink-500 truncate">{user.email}</p>
                  {user.plan && (
                    <span className="inline-block mt-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-medium text-brand-600 capitalize">
                      {user.plan}
                    </span>
                  )}
                </div>
              </div>

              {/* Primary CTA */}
              <Link
                href={nextUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Continue to Dashboard
              </Link>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-ink-400">or</span>
                </div>
              </div>

              {/* Sign out option */}
              <LogoutButton className="flex w-full items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm font-medium text-ink-600 hover:bg-surface-50 hover:text-ink-800 transition-colors cursor-pointer">
                <LogOut className="h-4 w-4" />
                Sign out &amp; use a different account
              </LogoutButton>
            </div>
          ) : (
            /* ── Not signed in — show login form ── */
            <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-surface-100" />}>
              <LoginForm />
            </Suspense>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
