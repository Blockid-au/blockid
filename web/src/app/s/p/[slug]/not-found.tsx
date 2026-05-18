import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";

export default function FounderPackNotFound() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-ink-950 pt-32 pb-24 text-slate-100">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
            404 · Founder Pack
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            This Founder Pack isn&apos;t available.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            The link may have expired, been deleted by its owner, or never
            existed. Start your own pack — it&apos;s free, no account needed
            until you save.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/tools/idea-valuation">
              <Button variant="primary" size="md" className="h-11">
                Validate your idea — free
              </Button>
            </Link>
            <Link href="/">
              <Button variant="secondary" size="md" className="h-11">
                Back to home
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
