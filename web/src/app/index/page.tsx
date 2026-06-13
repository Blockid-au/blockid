import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Zap, TrendingUp, BarChart3, Lock } from "lucide-react";
import { IndexWaitlistForm } from "./index-waitlist-form";

export const metadata: Metadata = {
  title: "BlockID Startup Index™ — Real-time Australian Startup Valuations",
  description:
    "The BlockID Startup Index™ (BSI-AU) is BlockID's proprietary market index built from real-time SVI analyses. Track valuation trends, sector momentum, and benchmark across Australian startups.",
};

export default function IndexPage() {
  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <PageViewTracker event="index_viewed" params={{}} />
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        {/* Hero */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 mb-6">
            <TrendingUp strokeWidth={1.75} className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-medium text-amber-700 uppercase tracking-[0.15em]">
              Early Beta
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-ink-900 mb-4">
            BlockID Startup Index<span className="text-amber-600">™</span>
          </h1>
          <p className="text-xl text-ink-600 max-w-2xl mx-auto leading-relaxed mb-2">
            BlockID's proprietary market index for Australian startups.
          </p>
          <p className="text-lg text-ink-500 max-w-2xl mx-auto leading-relaxed mb-6">
            Real-time SVI trends built from actual startup valuations. Like Nikkei or Dow Jones, but for startup valuations.
          </p>
          <p className="text-lg text-ink-500 max-w-xl mx-auto">
            Track sector momentum, benchmark against peers, and discover emerging valuations.
          </p>
        </div>

        {/* Key Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="rounded-2xl border border-surface-200 bg-white p-8">
            <BarChart3 className="h-8 w-8 text-brand-600 mb-4" />
            <h3 className="text-lg font-bold text-ink-900 mb-2">Proprietary Data Source</h3>
            <p className="text-ink-600">
              Built from thousands of BlockID SVI analyses. BlockID's competitive moat: only platform with real startup valuation data.
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-8">
            <Lock className="h-8 w-8 text-emerald-600 mb-4" />
            <h3 className="text-lg font-bold text-ink-900 mb-2">Privacy Protected</h3>
            <p className="text-ink-600">
              All data is anonymised and aggregated. No company names or PII. Pure market intelligence that founders, VCs, and accelerators can trust.
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-8">
            <Zap className="h-8 w-8 text-sky-600 mb-4" />
            <h3 className="text-lg font-bold text-ink-900 mb-2">Market Intelligence API</h3>
            <p className="text-ink-600">
              RESTful API for institutional users. Real-time sector momentum, valuation benchmarks, and historical trends.
            </p>
          </div>
        </div>

        {/* Use Cases */}
        <div className="bg-white rounded-2xl border border-surface-200 p-12 mb-20">
          <h2 className="text-3xl font-bold text-ink-900 mb-8 text-center">Who Uses It</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-bold text-ink-900 mb-2">Venture Capitals</h4>
              <p className="text-ink-600 text-sm">
                Monitor sector heating cycles, identify market corrections, and benchmark portfolio valuations against index.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-ink-900 mb-2">Accelerators</h4>
              <p className="text-ink-600 text-sm">
                Track cohort SVI performance vs market, showcase founder metrics to LPs, and identify industry clusters.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-ink-900 mb-2">Founders</h4>
              <p className="text-ink-600 text-sm">
                Benchmark your SVI against peers in your sector and stage, understand market positioning, and plan raises.
              </p>
            </div>
          </div>
        </div>

        {/* Waitlist CTA */}
        <div className="bg-gradient-to-br from-brand-50 to-brand-100 rounded-2xl border border-brand-200 p-12 mb-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-ink-900 mb-4">Join Beta</h2>
            <p className="text-lg text-ink-700 mb-8">
              Get early access to BlockID Startup Index API. VCs, accelerators, and data-driven founders only.
            </p>
            <IndexWaitlistForm />
          </div>
        </div>

        {/* Pricing Preview */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-ink-900 mb-8">Pricing (Launching Q3 2026)</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <div className="rounded-2xl border border-surface-200 bg-white p-8">
              <p className="text-sm uppercase tracking-widest text-ink-500 font-bold mb-2">Starter</p>
              <p className="text-3xl font-bold text-ink-900 mb-1">A$99<span className="text-lg text-ink-600">/mo</span></p>
              <p className="text-sm text-ink-600 mb-6">Up to 5,000 requests/month</p>
              <ul className="text-sm text-ink-700 space-y-2 text-left">
                <li>✓ Daily snapshots (24h lag)</li>
                <li>✓ Sector trends</li>
                <li>✓ Basic API access</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-brand-300 bg-brand-50 p-8 relative">
              <div className="absolute top--4 left-1/2 -translate-x-1/2 bg-brand-600 text-white px-4 py-1 rounded-full text-xs font-bold">
                Most Popular
              </div>
              <p className="text-sm uppercase tracking-widest text-brand-700 font-bold mb-2">Growth</p>
              <p className="text-3xl font-bold text-ink-900 mb-1">A$299<span className="text-lg text-ink-600">/mo</span></p>
              <p className="text-sm text-ink-600 mb-6">Up to 50,000 requests/month</p>
              <ul className="text-sm text-ink-700 space-y-2 text-left">
                <li>✓ Real-time snapshots</li>
                <li>✓ Custom sub-indices</li>
                <li>✓ Historical analysis</li>
                <li>✓ Priority support</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Roadmap Teaser */}
        <div className="bg-surface-100 rounded-2xl p-12 text-center">
          <h3 className="text-2xl font-bold text-ink-900 mb-4">Launching Soon</h3>
          <p className="text-ink-600 max-w-lg mx-auto mb-6">
            Phase 1 (Now): Data collection. Phase 2 (M020): Index engine. Phase 3 (M025): Public API. Phase 4 (M030+): Industry standard.
          </p>
          <Link href="/insights" className="inline-flex items-center gap-2 text-brand-600 font-semibold hover:text-brand-700">
            Learn more in BlockID insights →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
