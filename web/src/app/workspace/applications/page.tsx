// /workspace/applications — nav-linked stub while the full page is built.
// Ships a minimal header + coming-soon message so the nav never 404s.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Applications | Workspace | BlockID",
  description: "Track accelerator cohort applications in one inbox.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold text-ink-900">Applications</h1>
      <p className="mt-4 text-ink-600">Track accelerator cohort applications in one inbox.</p>
      <p className="mt-6 text-sm text-ink-500">
        This surface is under active build. In the meantime, jump back to your
        workspace overview.
      </p>
      <div className="mt-8">
        <Link
          href="/workspace"
          className="inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to Workspace
        </Link>
      </div>
    </main>
  );
}
