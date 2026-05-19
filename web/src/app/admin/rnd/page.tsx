import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { ArrowLeft, Shield } from "lucide-react";
import { RndDashboard } from "./rnd-dashboard";

export const metadata: Metadata = {
  title: "AI R&D Agent — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RndPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/rnd");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <p className="text-ink-600 text-sm mb-6">You don&apos;t have admin access to BlockID.</p>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo variant="light" />
          <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-700">{user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-xs text-ink-700 hover:text-ink-800 transition-colors cursor-pointer">Sign out</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ink-800">AI R&D Agent</h1>
            <p className="text-sm text-ink-700 mt-1">AI-powered market research, feature proposals, pricing analysis and CTA optimization.</p>
          </div>
        </div>

        <RndDashboard />
      </main>
    </div>
  );
}
