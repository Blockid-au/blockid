/**
 * /docs/startup-package — public guide for the Startup Package (Ship 1).
 *
 * Static React Server Component. Wrapped in MarketingShell so it inherits
 * the fintech marketing chrome (skip-link, NavV2, footer, deep-navy bg).
 * Documents:
 *   • What the package is (5 headline steps)
 *   • Pricing (A$149 one-off + 25 credits)
 *   • The 8-step guided interview with expected time
 *   • The 12-phase journey (link to /guide)
 *   • The 14 unicorn-playbook tasks pulled from
 *     lib/startup-package/unicorn-playbook.ts (sub-goal 13). If that module
 *     is not present yet at merge time, an in-file fallback keeps the page
 *     rendering without a broken import.
 *   • FAQ
 *
 * NO client interactivity. No credit-spending buttons live on this page —
 * founders convert to the flow at /startup-package.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";

// -----------------------------------------------------------------------------
// Unicorn playbook — hard-coded fallback. If sub-goal 13's typed module lands
// (`lib/startup-package/unicorn-playbook.ts` exporting UNICORN_PLAYBOOK), the
// import above should be swapped in; keeping the fallback here means the doc
// page still ships even when the module is not yet on the merge base.
// -----------------------------------------------------------------------------

interface PlaybookTask {
  id: string;
  title: string;
  phaseId: string;
  why: string;
  when: string;
}

const UNICORN_PLAYBOOK_FALLBACK: PlaybookTask[] = [
  {
    id: "founder-story-repo",
    title: "Founder story repo",
    phaseId: "vision",
    why: "Every unicorn deck opens with a 90-second founder story — writing it early forces clarity on why you.",
    when: "Week 1 — before any customer interview.",
  },
  {
    id: "10-customer-interviews",
    title: "10 recorded customer interviews",
    phaseId: "customer_dev",
    why: "Atlassian's early product decisions came from 12 interviews with sysadmins. Recordings compound as evidence.",
    when: "Weeks 2-3 — before writing the pitch deck.",
  },
  {
    id: "pricing-experiment-log",
    title: "Pricing experiment log",
    phaseId: "revenue_model",
    why: "Xero shipped 3 pricing tiers within its first 12 months. Log every change with the delta in trial→paid conversion.",
    when: "Weeks 4-6 — right after your first 10 paying customers.",
  },
  {
    id: "public-changelog",
    title: "Public changelog from day one",
    phaseId: "pitch",
    why: "Investors read your changelog to gauge ship cadence. Canva shipped weekly public notes before the Series A.",
    when: "Week 1 onward, published at /changelog.",
  },
  {
    id: "advisor-agreement-pack",
    title: "Advisor agreement pack (FAST-style)",
    phaseId: "mentor_review",
    why: "Standardised 0.25–1.0% advisor grants remove founder-advisor negotiation friction. Y Combinator FAST is the reference.",
    when: "Week 4-6 — when you have your first paid customer / traction to attract advisors.",
  },
  {
    id: "shareholders-agreement",
    title: "Signed shareholders' agreement + IP assignment",
    phaseId: "legal_equity",
    why: "Missing SHA is the #1 blocker Australian VCs raise in DD. Get it signed before term sheet talks.",
    when: "Week 6-8 — before you approach any external investor.",
  },
  {
    id: "gtm-channel-tests",
    title: "3 channel-tests with cost per acquisition",
    phaseId: "go_to_market",
    why: "Airwallex ran paid social, outbound, and partnerships in parallel before doubling down on partnerships.",
    when: "Weeks 8-12 — after product feels defensible.",
  },
  {
    id: "product-metric-north-star",
    title: "One North-Star metric wired into the product",
    phaseId: "product_dev",
    why: "Every unicorn we studied surfaced one metric that predicted retention (Canva: 5 designs in first 7 days).",
    when: "Weeks 10-14 — as soon as you have >100 active users.",
  },
  {
    id: "data-room-live",
    title: "Live data room shared with 3 advisors",
    phaseId: "investor_review",
    why: "Sharing early gets you red-flagged before the real term-sheet round. Turns friction into learning cycles.",
    when: "Weeks 12-16 — before your first pitch.",
  },
  {
    id: "founder-hires-2",
    title: "Two 'A-player' hires under founder-referral",
    phaseId: "team",
    why: "Culture Amp's first 5 hires were all direct referrals — hiring quality compounds.",
    when: "Post-seed — once you have runway for 12+ months.",
  },
  {
    id: "series-a-metrics-board",
    title: "Series-A metrics board (T2D3, magic number, quick ratio)",
    phaseId: "growth",
    why: "Aussie Series A investors expect T2D3 growth and magic number > 0.75. Track early, adjust before the raise.",
    when: "Month 6-9 — before opening the Series A.",
  },
  {
    id: "board-charter",
    title: "Board charter + first observer",
    phaseId: "growth",
    why: "Adding an independent observer 6 months before your first institutional round de-risks board dynamics.",
    when: "Month 9-12.",
  },
  {
    id: "esic-esvclp-eligibility",
    title: "ESIC / ESVCLP eligibility filing",
    phaseId: "funding",
    why: "Australian angels get an immediate 20% tax offset for ESIC-eligible investments. Missing this shrinks your investor pool.",
    when: "Before opening any priced round to Aussie angels.",
  },
  {
    id: "quarterly-investor-update",
    title: "Quarterly investor update (SaaStr template)",
    phaseId: "funding",
    why: "The single biggest predictor of follow-on investment. SaaStr's 5-block template is the industry default.",
    when: "Every quarter from the day you close your first cheque.",
  },
];

// Use the fallback list. When sub-goal 13's typed module
// (`lib/startup-package/unicorn-playbook.ts`) lands, swap the following
// line to `import { UNICORN_PLAYBOOK as PLAYBOOK } from "@/lib/startup-package/unicorn-playbook"`
// — the tasks[] shape is stable.
const PLAYBOOK: PlaybookTask[] = UNICORN_PLAYBOOK_FALLBACK;

// -----------------------------------------------------------------------------
// 8-step guided interview — mirrors the ship-1 spec. Kept inline (not
// imported) so this page ships even if lib/startup-package/interview-steps.ts
// is not on the merge base yet.
// -----------------------------------------------------------------------------

interface InterviewRow {
  step: number;
  key: string;
  prompt: string;
  minutes: number;
}

const INTERVIEW_STEPS: InterviewRow[] = [
  { step: 1, key: "vision", prompt: "What problem are you solving, for whom, and why now?", minutes: 4 },
  { step: 2, key: "customer_dev", prompt: "Describe your first 5 conversations with likely customers.", minutes: 5 },
  { step: 3, key: "revenue_model", prompt: "How will you make money and what will people pay?", minutes: 4 },
  { step: 4, key: "pitch", prompt: "Write a 60-second elevator pitch for your startup.", minutes: 3 },
  { step: 5, key: "legal_equity", prompt: "Who are the founders and what's the equity split?", minutes: 3 },
  { step: 6, key: "go_to_market", prompt: "What are the 2-3 channels you'll test first?", minutes: 4 },
  { step: 7, key: "team", prompt: "Who's on the team and what roles are missing?", minutes: 3 },
  { step: 8, key: "funding", prompt: "How much are you raising and what will the money buy?", minutes: 4 },
];

const TOTAL_INTERVIEW_MINUTES = INTERVIEW_STEPS.reduce((s, r) => s + r.minutes, 0);

// -----------------------------------------------------------------------------
// Metadata
// -----------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Startup Package guide — BlockID.au",
  description:
    "A guided founder journey — 8-step interview, 4 auto-agent passes, day-0 dataroom, public listing, weekly progress emails. A$149 one-off + 25 credits.",
  alternates: {
    canonical: "https://blockid.au/docs/startup-package",
  },
};

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function StartupPackageGuidePage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-6 py-16">
        {/* Hero */}
        <div className="mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-400 font-medium mb-3">
            Docs / Startup Package
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Startup Package guide
          </h1>
          <p className="mt-5 text-base md:text-lg leading-relaxed opacity-80 max-w-2xl">
            The Startup Package stitches BlockID&rsquo;s existing surfaces
            &mdash; interview capture, C-Level agents, SVI scoring, dataroom
            seed, public listing &mdash; into one guided founder journey. Buy
            once, then drive your startup phase-by-phase toward
            investor-ready.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/startup-package"
              className="inline-flex items-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 transition-colors"
            >
              Open the Startup Package
            </Link>
            <Link
              href="/guide"
              className="inline-flex items-center rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              12-phase journey overview
            </Link>
          </div>
        </div>

        {/* What is it */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-3">What is the Startup Package?</h2>
          <p className="text-sm opacity-80 mb-6 leading-relaxed">
            One purchase provisions the guided flow end-to-end. Five headline
            steps every founder takes:
          </p>
          <ol className="space-y-3 list-decimal list-inside">
            <li className="text-sm leading-relaxed">
              <span className="font-semibold">Guided 8-step interview</span> &mdash;
              captures the raw signal every agent needs, auto-saves after every step.
            </li>
            <li className="text-sm leading-relaxed">
              <span className="font-semibold">Auto agent passes</span> &mdash;
              CEO, CMO, CFO and CTO agents each analyse the interview and file
              a section into your dataroom.
            </li>
            <li className="text-sm leading-relaxed">
              <span className="font-semibold">Live SVI snapshot</span> &mdash;
              your Startup Valuation Index score updates in real time as the
              interview + agent output land.
            </li>
            <li className="text-sm leading-relaxed">
              <span className="font-semibold">Day-0 dataroom</span> &mdash;
              10 investor-ready templates are seeded on purchase, ready to
              share with an advisor within an hour.
            </li>
            <li className="text-sm leading-relaxed">
              <span className="font-semibold">Public listing + weekly emails</span>{" "}
              &mdash; your startup gets a public /startup/[slug] page and a
              phase-aware weekly progress email.
            </li>
          </ol>
        </section>

        {/* Pricing */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-3">Pricing</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-3">
              <p className="text-3xl font-bold">A$149</p>
              <p className="text-sm opacity-70">one-off &mdash; no subscription</p>
            </div>
            <ul className="space-y-2 text-sm opacity-90">
              <li>25 credits pre-loaded &mdash; enough for 4 auto-agent passes and the first PDF exports.</li>
              <li>All 10 day-0 dataroom templates seeded on purchase.</li>
              <li>Public /startup/[slug] page unlocked.</li>
              <li>Weekly progress emails for as long as you keep the project active.</li>
              <li>Every subsequent agent analysis shows credit cost + word count <em>before</em> execution &mdash; you never spend without confirming.</li>
            </ul>
            <p className="text-xs opacity-60 mt-4">
              Try before you buy: the free-trial grant runs one CEO pass on a
              4-question mini-interview at no charge.
            </p>
          </div>
        </section>

        {/* 8-step interview */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-3">The 8-step guided interview</h2>
          <p className="text-sm opacity-80 mb-6 leading-relaxed">
            Total expected time: ~{TOTAL_INTERVIEW_MINUTES} minutes. Autosaves
            after every step, so you can walk away and come back.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Phase</th>
                  <th className="px-4 py-3 font-semibold">Prompt</th>
                  <th className="px-4 py-3 font-semibold text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {INTERVIEW_STEPS.map((row) => (
                  <tr key={row.step} className="border-t border-white/10 align-top">
                    <td className="px-4 py-3 font-mono tabular-nums opacity-70">{row.step}</td>
                    <td className="px-4 py-3 font-mono text-xs opacity-80">{row.key}</td>
                    <td className="px-4 py-3 opacity-90">{row.prompt}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums opacity-70">
                      {row.minutes} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 12-phase journey */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-3">The 12-phase journey</h2>
          <p className="text-sm opacity-80 mb-4 leading-relaxed">
            The Package doesn&rsquo;t replace the 12-phase growth journey
            &mdash; it <em>drives</em> you through it. Each phase has a lead
            C-Level agent and a deliverable list; the Package surfaces the
            phase you&rsquo;re on and offers credit-priced auto-fill buttons
            for each deliverable.
          </p>
          <Link
            href="/guide"
            className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Read the full 12-phase guide &rarr;
          </Link>
        </section>

        {/* Unicorn playbook */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-3">
            Unicorn playbook &mdash; {PLAYBOOK.length} optional tasks
          </h2>
          <p className="text-sm opacity-80 mb-6 leading-relaxed">
            These are the concrete moves we observed in the Atlassian, Canva,
            Xero, Airwallex and Culture Amp fixtures that the base 12-phase
            spec does <em>not</em> surface. They&rsquo;re optional but
            recommended &mdash; the Package will nudge you toward each one at
            the right phase.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Task</th>
                  <th className="px-4 py-3 font-semibold">Why</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {PLAYBOOK.map((task) => (
                  <tr key={task.id} className="border-t border-white/10 align-top">
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {task.title}
                      <div className="text-[11px] font-mono opacity-50 mt-1">
                        {task.phaseId}
                      </div>
                    </td>
                    <td className="px-4 py-3 opacity-90 leading-relaxed">{task.why}</td>
                    <td className="px-4 py-3 opacity-80 leading-relaxed">{task.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-6">FAQ</h2>
          <div className="space-y-6">
            <div>
              <p className="font-semibold mb-1">Is A$149 a subscription?</p>
              <p className="text-sm opacity-80 leading-relaxed">
                No. It&rsquo;s a one-off purchase that unlocks the Startup
                Package flow. Ongoing agent work is paid from your credit
                balance &mdash; every button shows the credit cost + word count
                before you commit.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1">Do I have to mint an on-chain token?</p>
              <p className="text-sm opacity-80 leading-relaxed">
                No. Ship 1 reserves your cap-table allocation in the database
                only. On-chain issuance is opt-in and ships in a later
                release.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1">Can I cancel after purchase?</p>
              <p className="text-sm opacity-80 leading-relaxed">
                The package is a one-off unlock &mdash; there&rsquo;s nothing
                recurring to cancel. Unused credits stay on your balance for
                12 months.
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1">Where does my data live?</p>
              <p className="text-sm opacity-80 leading-relaxed">
                Every answer, dataroom file and SVI snapshot is stored in the
                Australian-hosted Supabase project behind row-level security.
                See <Link href="/legal/privacy" className="underline">/legal/privacy</Link>{" "}
                for details.
              </p>
            </div>
          </div>
        </section>

        {/* Related surfaces */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Related</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              href="/startup-package"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-brand-500/40 transition-colors"
            >
              <p className="font-semibold mb-1">/startup-package</p>
              <p className="text-xs opacity-70">Open the packaged founder flow.</p>
            </Link>
            <Link
              href="/guide"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-brand-500/40 transition-colors"
            >
              <p className="font-semibold mb-1">/guide</p>
              <p className="text-xs opacity-70">Full 12-phase growth journey.</p>
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-brand-500/40 transition-colors"
            >
              <p className="font-semibold mb-1">/pricing</p>
              <p className="text-xs opacity-70">All plans, credit packs, add-ons.</p>
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-brand-500/40 transition-colors"
            >
              <p className="font-semibold mb-1">/docs</p>
              <p className="text-xs opacity-70">Platform docs index.</p>
            </Link>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
