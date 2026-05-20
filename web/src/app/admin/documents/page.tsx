import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import DocumentsUpload from "./documents-upload";

export const metadata: Metadata = {
  title: "Documents — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/documents");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) redirect("/dashboard");

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo variant="light" />
          <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
        </div>
        <Link href="/admin" className="text-xs text-ink-700 hover:text-ink-800 transition-colors">
          Back to Admin
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Upload Documents</h1>
          <p className="text-sm text-ink-700 mt-1">Upload project documents directly to Google Drive.</p>
        </div>

        <DocumentsUpload />
      </main>
    </div>
  );
}
