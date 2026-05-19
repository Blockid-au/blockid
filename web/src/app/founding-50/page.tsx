import type { Metadata } from "next";
import { Founding50Form } from "./founding-50-form";
import { Logo } from "@/components/brand/logo";
import {
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Founding 50 — Startup Value Account | BlockID.au",
  description:
    "Claim one of 50 Founding accounts. Get your Startup Value Index Account for AUD $49 (normally $99). Includes cap table starter, Evidence Vault, and export packs.",
};

const INCLUDES = [
  {
    icon: TrendingUp,
    title: "Startup Value Index Account",
    desc: "Your SVI baseline + lifetime tracking as you grow",
  },
  {
    icon: Users,
    title: "Founder Value Index",
    desc: "Measure and document your founder-market fit score",
  },
  {
    icon: LayoutDashboard,
    title: "Cap Table Starter",
    desc: "Build your equity split, vesting schedule, and ESOP pool",
  },
  {
    icon: ShieldCheck,
    title: "Evidence Vault Lite",
    desc: "Store pitch deck, cap table, financial model, and proof docs",
  },
  {
    icon: FileText,
    title: "Export Packs",
    desc: "Ready-to-use profiles for Product Hunt, LinkedIn, Crunchbase, OpenVC",
  },
  {
    icon: Zap,
    title: "30-Day Value Growth Plan",
    desc: "Step-by-step action plan to grow your SVI in the first month",
  },
];

export default function Founding50Page() {
  return (
    <div className="min-h-svh bg-ink-950 text-slate-50">
      {/* Nav */}
      <header className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <Logo variant="dark" />
        <a
          href="/"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back to SVI
        </a>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-24">
        {/* Hero */}
        <div className="text-center pt-10 pb-12">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-600/40 bg-brand-900/30 px-4 py-1.5 mb-6">
            <Clock strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-400" />
            <span className="text-xs font-medium text-brand-300 uppercase tracking-[0.15em]">
              Limited — 50 Founding Accounts Only
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-50 mb-4">
            Claim Your{" "}
            <span className="text-brand-400">Founding 50</span>{" "}
            Account
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed mb-6">
            Get a lifetime Startup Value Index Account — measure, prove and grow
            your startup value from day one.
          </p>

          {/* Price */}
          <div className="inline-flex items-baseline gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-8 py-4">
            <span className="text-slate-500 text-xl line-through font-mono">$99</span>
            <span className="text-5xl font-bold font-mono text-slate-50">$49</span>
            <span className="text-slate-400 text-sm">AUD · one-off</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Launch price. No recurring fees. Cancel-free.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          {/* What's included */}
          <div>
            <h2 className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-6">
              What you get
            </h2>
            <ul className="space-y-4">
              {INCLUDES.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-600/30 bg-brand-900/40 text-brand-400">
                    <Icon strokeWidth={1.75} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Social proof */}
            <div className="mt-8 rounded-xl border border-ink-700 bg-ink-900 p-4">
              <p className="text-xs text-slate-500 italic leading-relaxed">
                "A bad idea costs you time. A bad equity split can cost you the company. BlockID helps you get both right from day one."
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium">
                — BlockID Founding Team
              </p>
            </div>

            {/* Trust badges */}
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                "AU data residency",
                "No credit card required",
                "Secure checkout",
                "50 spots only",
              ].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-[10px] font-medium text-slate-400"
                >
                  <CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-green-400" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Form */}
          <Founding50Form />
        </div>

        {/* FAQ */}
        <div className="mt-20 border-t border-ink-700 pt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-8 text-center">
            Common questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                q: "What is the Startup Value Index?",
                a: "SVI is a number that measures startup value based on evidence — product, revenue, team, cap table, and proof. It starts at 100 and grows as you add milestones and evidence.",
              },
              {
                q: "Is this a valuation?",
                a: "No. SVI is a progress indicator — not a legal valuation or financial advice. Engage a licensed adviser for your raise.",
              },
              {
                q: "What happens after I pay?",
                a: "You'll receive access to your Startup Value Account within 24 hours via email. We'll also send you a 30-day growth plan.",
              },
              {
                q: "Why only 50 spots?",
                a: "We're delivering the first 50 accounts with white-glove onboarding. This lets us refine the product with real founder feedback before opening broadly.",
              },
              {
                q: "Can I upgrade later?",
                a: "Yes. Founding 50 gives you access to all current features. As we ship Founder Pro and Growth plans, you'll get priority upgrade pricing.",
              },
              {
                q: "Is my data private?",
                a: "Yes. Your data is stored in Australia and never shared without your consent. You own your startup data.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
                <p className="text-sm font-semibold text-slate-100 mb-1.5">{q}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
