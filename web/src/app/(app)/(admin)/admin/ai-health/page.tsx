import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { readRegistry } from "@/lib/ai/registry";
import { ArrowLeft, Shield } from "lucide-react";
import { AIHealthClient } from "./ai-health-client";

export const metadata: Metadata = {
  title: "AI Model Health — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AIHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/ai-health");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
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

  const registry = readRegistry(true);

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 max-w-6xl mx-auto flex items-center gap-3">
        <Link href="/admin" className="text-ink-600 hover:text-ink-800">
          <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold">AI Model Health Monitor</h1>
        <span className="text-xs text-ink-500 ml-auto">
          Updated {registry.updated_at ? new Date(registry.updated_at).toLocaleString() : "never"}
        </span>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <AIHealthClient initialRegistry={registry} />
      </main>
    </div>
  );
}
