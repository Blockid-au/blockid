import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { ArrowLeft, Shield } from "lucide-react";
import { AIKeysClient } from "./ai-keys-client";

export const metadata: Metadata = {
  title: "AI Provider Keys — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AIKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/ai-keys");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">← Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
            AI KEYS
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <AIKeysClient />
      </main>
    </div>
  );
}
