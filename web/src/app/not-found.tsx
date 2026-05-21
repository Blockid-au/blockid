import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-svh bg-surface-100 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-brand-600 mb-4">404</p>
        <h1 className="text-2xl font-bold text-ink-800 mb-2">Page not found</h1>
        <p className="text-ink-600 text-sm mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get Your Free SVI Score
          </Link>
          <Link
            href="/insights"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-surface-300 bg-white px-6 text-sm font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
          >
            Read Founder Insights
          </Link>
        </div>
        <p className="mt-8 text-xs text-ink-500">
          <Link href="/" className="text-brand-600 hover:text-brand-700">BlockID.au</Link> — Startup Value Index
        </p>
      </div>
    </div>
  );
}
