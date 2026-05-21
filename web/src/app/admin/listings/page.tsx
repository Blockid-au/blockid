import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import Link from "next/link";
import { ExternalLink, CheckCircle2, Clock, AlertCircle, Circle } from "lucide-react";

export const metadata = { title: "Platform Listings — Admin" };

const PLATFORMS = [
  // Tier 1
  { name: "Product Hunt", url: "https://www.producthunt.com", tier: 1, status: "todo", type: "Product launch", action: "Create upcoming page, schedule launch", guide: "#producthunt" },
  { name: "AngelList / Wellfound", url: "https://wellfound.com", tier: 1, status: "todo", type: "Investor + hiring", action: "Create company profile, list open roles", guide: "#angellist" },
  { name: "Crunchbase", url: "https://www.crunchbase.com", tier: 1, status: "todo", type: "Company profile", action: "Claim profile, add funding + team", guide: "#crunchbase" },
  { name: "LinkedIn Company", url: "https://linkedin.com", tier: 1, status: "in_progress", type: "Professional", action: "Complete company page setup", guide: "#linkedin" },
  { name: "Startmate", url: "https://www.startmate.com.au", tier: 1, status: "planned", type: "AU accelerator", action: "Submit application Aug 2026", guide: "#startmate" },
  { name: "Antler", url: "https://www.antler.co", tier: 1, status: "planned", type: "Global accelerator", action: "Submit application Jul 2026", guide: "#antler" },
  // Tier 2
  { name: "F6S", url: "https://www.f6s.com", tier: 2, status: "todo", type: "Grants + accelerators", action: "Create startup profile", guide: "#f6s" },
  { name: "Gust", url: "https://gust.com", tier: 2, status: "todo", type: "Angel investors", action: "Create company profile", guide: "#gust" },
  { name: "BetaList", url: "https://betalist.com", tier: 2, status: "todo", type: "Beta launch", action: "Submit for beta listing", guide: "#betalist" },
  { name: "G2", url: "https://www.g2.com", tier: 2, status: "todo", type: "SaaS reviews", action: "Create free listing", guide: "#g2" },
  { name: "Capterra", url: "https://www.capterra.com.au", tier: 2, status: "todo", type: "SaaS directory", action: "Create free listing", guide: "#capterra" },
  // Tier 3 AU
  { name: "Stone & Chalk", url: "https://www.stoneandchalk.com.au", tier: 3, status: "todo", type: "Fintech hub", action: "Apply for membership", guide: "#stoneandchalk" },
  { name: "Fishburners", url: "https://fishburners.org", tier: 3, status: "todo", type: "Co-working", action: "Apply for membership", guide: "#fishburners" },
  // Tier 4 Investor
  { name: "Birchal", url: "https://www.birchal.com", tier: 4, status: "evaluate", type: "AU equity crowdfund", action: "Evaluate feasibility", guide: "#birchal" },
];

const STATUS_CONFIG = {
  done: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Live" },
  in_progress: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "In Progress" },
  planned: { icon: Circle, color: "text-brand-600", bg: "bg-brand-50", label: "Planned" },
  todo: { icon: AlertCircle, color: "text-ink-400", bg: "bg-surface-100", label: "Todo" },
  evaluate: { icon: Circle, color: "text-ink-400", bg: "bg-surface-100", label: "Evaluate" },
};

export default async function ListingsPage() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    redirect("/auth/login");
  }

  const tiers = [1, 2, 3, 4];
  const tierLabels = ["Tier 1 — Must-Have", "Tier 2 — High Value", "Tier 3 — Australia-Specific", "Tier 4 — Investor Platforms"];

  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-ink-900">Platform Listings</h1>
              <p className="text-ink-500 mt-1">Track profile creation across startup directories and investor networks</p>
            </div>
            <Link href="/api/platform-stats" target="_blank"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-surface-50">
              View Live Stats <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          {tiers.map((tier, idx) => (
            <div key={tier} className="mb-8">
              <h2 className="text-lg font-bold text-ink-900 mb-3">{tierLabels[idx]}</h2>
              <div className="space-y-2">
                {PLATFORMS.filter(p => p.tier === tier).map(platform => {
                  const cfg = STATUS_CONFIG[platform.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.todo;
                  const Icon = cfg.icon;
                  return (
                    <div key={platform.name} className="flex items-center gap-4 rounded-2xl border border-surface-200 bg-white p-4 hover:shadow-sm transition-shadow">
                      <div className={`h-9 w-9 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                        <Icon strokeWidth={1.75} className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink-900">{platform.name}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-[10px] text-ink-400">{platform.type}</span>
                        </div>
                        <p className="text-xs text-ink-500 mt-0.5">{platform.action}</p>
                      </div>
                      <a href={platform.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                        Visit <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick setup guides */}
          <div className="mt-12 rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <h2 className="text-lg font-bold text-ink-900 mb-4">Quick Setup Guides</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { id: "producthunt", name: "Product Hunt", steps: ["Go to producthunt.com/posts/new", "Upload logo + screenshots", "Write tagline (60 chars)", "Add maker (your account)", "Set launch date", "Share with network on launch day"] },
                { id: "angellist", name: "AngelList / Wellfound", steps: ["Go to wellfound.com → Recruit → Post Company", "Complete company profile (use 300-word description)", "Add founding team with LinkedIn", "Set company stage + market", "Upload logo + product screenshots", "List any open roles (even 'future')"] },
                { id: "crunchbase", name: "Crunchbase", steps: ["Go to crunchbase.com → Add Your Company", "Fill organization details (use 150-word description)", "Add founders as People entries", "Set funding status + industry tags", "Upload logo (min 500x500)", "Verify with company email"] },
                { id: "f6s", name: "F6S", steps: ["Go to f6s.com → Add Startup", "Complete profile with metrics from /api/platform-stats", "Browse + apply to relevant accelerators", "Set up grant alerts for AU programs", "Link team members"] },
                { id: "betalist", name: "BetaList", steps: ["Go to betalist.com → Submit Startup", "Use 50-word tagline", "Add 3 screenshots + logo", "Set launch URL to blockid.au", "Wait for approval (2-7 days)"] },
                { id: "g2", name: "G2", steps: ["Go to sell.g2.com → List Your Product", "Choose 'Startup Equity Management' category", "Complete profile with 300-word description", "Upload product screenshots", "Invite early users to leave reviews"] },
              ].map(guide => (
                <div key={guide.id} id={guide.id} className="rounded-xl bg-white border border-surface-200 p-4">
                  <h3 className="text-sm font-bold text-ink-900 mb-2">{guide.name}</h3>
                  <ol className="space-y-1.5">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink-600">
                        <span className="h-4 w-4 rounded bg-brand-100 text-brand-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
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
