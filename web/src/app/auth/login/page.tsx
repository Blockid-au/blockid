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
    <main className="min-h-screen bg-[#0B1220] text-slate-100 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-[#0F172A] border border-[#1F2A44] rounded-2xl p-8">
        <p className="text-[11px] tracking-[0.2em] uppercase text-brand-500 font-medium mb-2">
          BlockID<span className="text-gold-400">.au</span>
        </p>
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          Own your cap table. Prove your equity. Raise with confidence.
        </p>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-ink-800" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
