import type { Metadata } from "next";
import { Founding50Form } from "./founding-50-form";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Founding50Spots } from "@/components/ui/founding50-spots";
import { Founding50Waitlist } from "@/components/ui/founding50-waitlist";
import { FoundingCountdown } from "@/components/ui/founding-countdown";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlatformConfig, founding_price_aud } from "@/lib/platform-config";
import {
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
  Flame,
  Star,
} from "lucide-react";

export const dynamic = "force-dynamic";

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

async function getSpotsRemaining(total: number): Promise<number> {
  if (!isSupabaseConfigured()) return total;
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return total;
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", "founding50");
    return Math.max(0, total - (count ?? 0));
  } catch {
    return total;
  }
}

export async function generateMetadata() {
  const cfg = await getPlatformConfig();
  return {
    title: `${cfg.founding_plan_name} — Startup Value Account`,
    description: `Claim one of ${cfg.founding_spots_total} Founding accounts. Get your Startup Value Index for ${founding_price_aud(cfg)} (limited time). Includes cap table, Evidence Vault, and exports.`,
    alternates: { canonical: "https://blockid.au/founding-50" },
  };
}

export default async function Founding50Page() {
  const cfg = await getPlatformConfig();
  const priceAud = founding_price_aud(cfg);
  const spotsRemaining = await getSpotsRemaining(cfg.founding_spots_total);
  return (
    <>
      <PageViewTracker event="founding50_viewed" params={{}} />
      <Navbar />
      <main className="min-h-svh bg-surface-100 text-ink-800 pt-28 pb-24">
        <div className="max-w-4xl mx-auto px-6">
        {/* Hero */}
        <div className="text-center pb-12">
          {/* Urgency badge row */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-4 py-1.5">
              <Flame strokeWidth={1.75} className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs font-bold text-red-700 uppercase tracking-[0.12em]">
                Only {spotsRemaining} of {cfg.founding_spots_total} spots left
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-600/40 bg-brand-50 px-4 py-1.5">
              <Star strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" fill="currentColor" />
              <span className="text-xs font-medium text-brand-700 uppercase tracking-[0.12em]">
                {cfg.founding_spots_total - spotsRemaining} founders already joined
              </span>
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900 mb-4">
            Claim Your{" "}
            <span className="text-brand-600">{cfg.founding_plan_name}</span>{" "}
            Account
          </h1>
          <p className="text-lg text-ink-600 max-w-xl mx-auto leading-relaxed mb-2">
            Get a lifetime Startup Value Index Account — measure, prove and grow
            your startup value from day one.
          </p>

          {/* Value highlights */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              {cfg.founding_credits} credits included
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              Lifetime access
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              No recurring fees
            </span>
          </div>

          {/* Countdown timer */}
          <div className="flex justify-center mb-6">
            <FoundingCountdown deadline={cfg.early_bird_deadline} />
          </div>

          {/* Live spots counter with progress bar */}
          <div className="max-w-xs mx-auto mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
                <Users strokeWidth={1.75} className="h-3.5 w-3.5" />
                <span>
                  <span className="font-bold text-ink-800">{cfg.founding_spots_total - spotsRemaining}</span> of {cfg.founding_spots_total} spots claimed
                </span>
              </span>
              <span className={`text-xs font-bold ${spotsRemaining <= 10 ? "text-red-600" : "text-brand-600"}`}>
                {spotsRemaining} left
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${spotsRemaining <= 10 ? "bg-red-500" : "bg-brand-500"}`}
                style={{ width: `${Math.round(((cfg.founding_spots_total - spotsRemaining) / cfg.founding_spots_total) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-ink-600">Live — updates in real time</span>
            </div>
          </div>
          <Founding50Spots className="max-w-xs mx-auto mb-6 hidden" />

          {/* Price */}
          <div className="inline-flex items-baseline gap-3 rounded-2xl border border-surface-200 bg-white px-8 py-4 shadow-sm">
            <span className="text-5xl font-bold font-mono text-ink-800">{priceAud}</span>
            <span className="text-ink-600 text-sm">one-off</span>
          </div>
          <p className="mt-3 text-xs text-ink-700">
            Launch price. No recurring fees. Cancel-free.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          {/* What's included */}
          <div>
            <h2 className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-6">
              What you get
            </h2>
            <ul className="space-y-4">
              {INCLUDES.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-600/30 bg-brand-50 text-brand-600">
                    <Icon strokeWidth={1.75} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-800">{title}</p>
                    <p className="text-xs text-ink-600 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Founder testimonials */}
            <div className="mt-8 space-y-3">
              <h3 className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-4">
                What founders are saying
              </h3>
              {[
                {
                  quote:
                    "We'd been guessing our startup's value for months. BlockID gave us a real number to take into investor conversations — and the cap table tool saved us from a costly equity mistake early on.",
                  name: "James O.",
                  role: "Co-founder, FinTech startup · Sydney",
                },
                {
                  quote:
                    "The Evidence Vault alone is worth it. I used to lose hours hunting for the right doc before every pitch. Now everything is in one place and investor-ready.",
                  name: "Sarah K.",
                  role: "CEO, B2B SaaS · Melbourne",
                },
                {
                  quote:
                    "Getting in as a Founding 100 member felt like a no-brainer at $1. The 30-day growth plan is genuinely useful — not just generic startup advice.",
                  name: "Marcus T.",
                  role: "Founder, HealthTech · Brisbane",
                },
              ].map(({ quote, name, role }) => (
                <div
                  key={name}
                  className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-xs text-ink-700 italic leading-relaxed">
                    &ldquo;{quote}&rdquo;
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 border border-brand-200 text-[10px] font-bold text-brand-700">
                      {name[0]}
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold text-ink-800">{name}</p>
                      <p className="text-[10px] text-ink-500">{role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust badges */}
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                "AU data residency",
                "No credit card required",
                "Secure checkout",
                `${cfg.founding_spots_total} spots only`,
              ].map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-1 text-[10px] font-medium text-ink-600"
                >
                  <CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-green-400" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Form or Waitlist */}
          {spotsRemaining > 0 ? <Founding50Form /> : <Founding50Waitlist />}
        </div>

        {/* Social proof ribbon — spots taken + deadline */}
        <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1.5">
              {["J", "S", "M", "A", "R"].map((initial) => (
                <span
                  key={initial}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-50 bg-brand-600 text-[10px] font-bold text-white"
                >
                  {initial}
                </span>
              ))}
            </div>
            <p className="text-sm font-semibold text-amber-900">
              Join the <span className="text-brand-700">{cfg.founding_spots_total - spotsRemaining} founders</span> who already claimed their spot
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-700 font-medium">
            <Clock strokeWidth={1.75} className="h-3.5 w-3.5" />
            Early-bird closes{" "}
            {new Date(cfg.early_bird_deadline).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>

        {/* Why join now */}
        <div className="mt-6 rounded-2xl border border-brand-600/20 bg-brand-50 px-8 py-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-5 text-center">
            Why join now?
          </h2>
          <ul className="space-y-4 max-w-lg mx-auto">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <CheckCircle2 strokeWidth={2} className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">Early-access pricing — $1 instead of $49</p>
                <p className="text-xs text-ink-600 mt-0.5">
                  Once the 100 spots are gone, the standard price applies. This discount never comes back.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <CheckCircle2 strokeWidth={2} className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">Founding Member badge on your profile</p>
                <p className="text-xs text-ink-600 mt-0.5">
                  Permanent recognition as a BlockID pioneer — visible to investors and partners on the platform.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <CheckCircle2 strokeWidth={2} className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">Direct access to the BlockID team</p>
                <p className="text-xs text-ink-600 mt-0.5">
                  White-glove onboarding, a dedicated Slack channel, and your feedback shapes the product roadmap.
                </p>
              </div>
            </li>
          </ul>
        </div>

        {/* FAQ */}
        <div className="mt-20 border-t border-surface-200 pt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-8 text-center">
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
                q: "Why only 100 spots?",
                a: "We're delivering the first 100 accounts with white-glove onboarding. This lets us refine the product with real founder feedback before opening broadly.",
              },
              {
                q: "Can I upgrade later?",
                a: "Yes. Founding 100 gives you access to all current features. As we ship Founder Pro and Growth plans, you'll get priority upgrade pricing.",
              },
              {
                q: "Is my data private?",
                a: "Yes. Your data is stored in Australia and never shared without your consent. You own your startup data.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-ink-800 mb-1.5">{q}</p>
                <p className="text-xs text-ink-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
