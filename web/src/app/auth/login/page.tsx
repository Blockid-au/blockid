import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · BlockID",
  description:
    "Sign in to your BlockID account with Google or a magic link.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-surface-100 text-ink-800 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 shadow-sm">
        <p className="text-[11px] tracking-[0.2em] uppercase text-brand-600 font-medium mb-4">
          BlockID<span className="text-gold-600">.au</span>
        </p>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-surface-100" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
