"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderOpen,
  Lightbulb,
  Menu,
  Mic,
  MicOff,
  PieChart,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SVIResultsPanel } from "@/components/svi/svi-results-panel";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type SubmitState = "idle" | "submitting" | "done" | "error";

interface SVIApiResponse {
  ok: boolean;
  slug: string;
  totalSVI: number;
  analysis: SVIAnalysis;
  persisted: boolean;
}

// ─── Data ────────────────────────────────────────────────────────────────────
const TOOLS = [
  { href: "/tools/idea-valuation", label: "Idea Valuation" },
  { href: "/tools/equity-split", label: "Equity Split" },
  { href: "/tools/funding-plan", label: "Funding Plan" },
  { href: "/tools/dilution", label: "Dilution Calculator" },
  { href: "/tools/cap-table", label: "Cap Table Diff" },
  { href: "/tools/term-sheet", label: "Term Sheet AI" },
  { href: "/tools/data-room", label: "Data Room Checklist" },
  { href: "/tools/cofounder-match", label: "Co-founder Match" },
];

const QUICK_EXAMPLES = [
  "AI SaaS for accountants in Australia",
  "Two-sided marketplace for tradies",
  "B2B fintech replacing bank guarantees",
  "D2C skincare brand, $50k MRR, raising seed",
];

const PILLARS = [
  { icon: ShieldCheck, title: "Trusted Ownership", desc: "Secure. Verifiable. Tamper-proof." },
  { icon: TrendingUp, title: "Capital Intelligence", desc: "Real-time insights. Value. Dilution. Growth." },
  { icon: Shield, title: "Investor Ready", desc: "Transparent. Compliant. Report at speed." },
  { icon: Bot, title: "AI-Powered Platform", desc: "Smarter decisions. Faster execution." },
];

const VALUE_PROPS = [
  { icon: Lightbulb, title: "Build Right", desc: "Set up your company, ownership & structure the right way." },
  { icon: ShieldCheck, title: "Protect Value", desc: "Transparent ownership builds trust and prevents conflicts." },
  { icon: TrendingUp, title: "Increase Valuation", desc: "Good governance + clear data = higher valuation." },
  { icon: Target, title: "Attract Investors", desc: "Be investor-ready anytime with trusted data." },
  { icon: Rocket, title: "Scale Faster", desc: "Make better decisions with real-time insights and AI." },
];

const ROADMAP_STEPS = [
  { num: 1, icon: Lightbulb, title: "Validate Your Idea", desc: "Define problem, market and solution. Validate demand early.", href: "/tools/idea-valuation" },
  { num: 2, icon: Users, title: "Plan & Structure", desc: "Choose entity, set up ownership, roles, vesting & governance.", href: "/tools/equity-split" },
  { num: 3, icon: Bot, title: "Build with AI", desc: "Use AI to build MVP faster, smarter and more efficiently.", href: "/" },
  { num: 4, icon: Search, title: "Analyze Market", desc: "Understand competitors, positioning, pricing and differentiation.", href: "/tools/idea-valuation" },
  { num: 5, icon: PieChart, title: "Price with Value", desc: "Define pricing strategy based on value, market and customers.", href: "/tools/dilution" },
  { num: 6, icon: PieChart, title: "Manage Ownership", desc: "Cap table, equity plan, ESOP, vesting & ownership clarity.", href: "/tools/cap-table" },
  { num: 7, icon: FolderOpen, title: "Build Data Room", desc: "Organize documents, financials, legal & investor materials.", href: "/tools/data-room" },
  { num: 8, icon: FileText, title: "Prepare for Pre-Seed", desc: "Investor deck, metrics, traction, valuation & fundraising strategy.", href: "/" },
  { num: 9, icon: Rocket, title: "Go-to-Market", desc: "Define ICP, channels, messaging and growth strategy.", href: "/" },
  { num: 10, icon: Target, title: "Attract Investors", desc: "Pitch, negotiate, close and grow together.", href: "/founding-50" },
];

const BOTTOM_BENEFITS = [
  { icon: ShieldCheck, title: "Ownership Clarity", desc: "Stronger team alignment and trust." },
  { icon: Shield, title: "Investor Confidence", desc: "Better data. Faster decisions. Higher trust." },
  { icon: TrendingUp, title: "Higher Valuation", desc: "Well-structured companies attract higher valuations." },
  { icon: Bot, title: "AI Advantage", desc: "Work smarter. Move faster. Stay ahead." },
  { icon: Zap, title: "Built for the Future", desc: "Scalable infrastructure for private companies." },
];

// ═══════════════════════════════════════════════════════════════════════════════
export function SVIEntrance() {
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [email, setEmail] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [state, setState] = React.useState<SubmitState>("idle");
  const [result, setResult] = React.useState<SVIApiResponse | null>(null);
  const [error, setError] = React.useState("");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = typeof window !== "undefined" ? (window as any) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec: (new () => any) | undefined = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
    if (!SpeechRec) { alert("Voice input is not supported. Try Chrome or Edge."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRec();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-AU";
    let ft = text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) ft += t + " "; else interim = t; } setText(ft + interim); };
    rec.onend = () => setListening(false);
    rec.start(); recognitionRef.current = rec; setListening(true);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setFile(f); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    const rawText = file ? `File: ${file.name}\n${text}` : text;
    if (!rawText.trim() && !file) { setError("Please describe your idea or upload a document."); return; }
    setError(""); setState("submitting");
    try {
      const res = await fetch("/api/svi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, input: { rawText: rawText.trim() || `Business plan document: ${file?.name}`, fileName: file?.name } }) });
      const data = (await res.json()) as SVIApiResponse;
      if (!data.ok) { setError("Analysis failed. Please try again."); setState("error"); return; }
      setResult(data); setState("done");
    } catch { setError("Network error. Please try again."); setState("error"); }
  };

  const handleReset = () => { setResult(null); setState("idle"); setText(""); setFile(null); setEmail(""); setError(""); };

  // ── Results view
  if (state === "done" && result) {
    return (
      <div className="min-h-svh bg-surface-100 flex flex-col">
        <header className="px-6 py-5 flex items-center justify-between max-w-2xl mx-auto w-full">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-official.png" alt="BlockID.au" className="h-11 md:h-12 w-auto" />
          </Link>
          <button type="button" onClick={handleReset} className="text-xs text-ink-600 hover:text-ink-800 cursor-pointer transition-colors flex items-center gap-1.5">
            <X strokeWidth={1.75} className="h-3.5 w-3.5" /> New analysis
          </button>
        </header>
        <main className="flex-1 px-4 pb-12">
          <SVIResultsPanel analysis={result.analysis} slug={result.slug} onReset={handleReset} rawText={text} />
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Full landing page
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-svh bg-white flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <TopBar />

      {/* ── HERO SECTION ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-brand-50/30 to-white">
        <div className="mx-auto max-w-7xl px-6 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.1] text-ink-800">
                Turn Your Idea Into<br />
                A <span className="text-brand-600">Valuable, Investable</span> Business.
              </h1>
              <p className="mt-4 text-lg md:text-xl font-semibold text-brand-600">
                Trusted Ownership. Intelligent Capital. Sustainable Growth.
              </p>
              <p className="mt-4 text-base text-ink-600 leading-relaxed max-w-lg">
                BlockID.au is the all-in-one platform for founders, co-founders and teams to
                build, manage and grow your company with clarity, trust and intelligence.
                From idea to investment — build right from the start.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#svi" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Start Your Journey <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </a>
                <Link href="/tools/idea-valuation" className="inline-flex h-12 items-center gap-2 rounded-xl border border-surface-300 bg-white px-6 text-base font-semibold text-ink-700 hover:bg-surface-100 transition-colors">
                  Explore Platform <Rocket strokeWidth={1.75} className="h-4 w-4" />
                </Link>
              </div>
            </div>
            {/* Right: banner — cropped to show only platform UI screenshots */}
            <div className="relative rounded-2xl border border-surface-200 shadow-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://upload.blockid.au/blockID_banner_white.png"
                alt="BlockID.au — Cap Table, Valuation, AI Workspace"
                className="w-[200%] max-w-none h-auto -ml-[50%]"
                style={{ clipPath: "inset(0 0 0 50%)" }}
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          {/* 4 Pillars */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
            {PILLARS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center rounded-xl border border-surface-200 bg-white px-4 py-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                  <Icon strokeWidth={1.75} className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-ink-800">{title}</p>
                <p className="text-xs text-ink-600 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SVI SEARCH SECTION ────────────────────────────────────────────── */}
      <section id="svi" className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[620px] px-6 flex flex-col items-center">
          <div className="flex flex-col items-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-official.png" alt="BlockID.au" className="h-28 sm:h-32 md:h-36 w-auto mb-6" />
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center text-ink-800">
              Get Your <span className="text-brand-600">Startup Value Index</span>
            </h2>
            <p className="mt-2 text-sm text-ink-600">Free AI-powered analysis in under 60 seconds</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full">
            <div className={cn(
              "w-full rounded-3xl border transition-all duration-200",
              searchFocused || text ? "border-brand-300 shadow-[0_1px_8px_rgba(37,99,235,0.15)]" : "border-surface-300 hover:shadow-[0_1px_6px_rgba(32,33,36,0.18)]",
            )}>
              <div className="flex items-center px-4 py-3 gap-3">
                <Search strokeWidth={1.75} className="h-5 w-5 text-ink-600 shrink-0" />
                <textarea ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
                  placeholder="Describe your startup idea, business plan, or paste key details…" rows={1}
                  className="flex-1 resize-none text-base text-ink-800 placeholder:text-ink-600 focus:outline-none bg-transparent leading-relaxed"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <button type="button" onClick={toggleVoice} aria-label={listening ? "Stop" : "Voice"}
                  className={cn("shrink-0 h-9 w-9 flex items-center justify-center rounded-full cursor-pointer transition-colors",
                    listening ? "bg-red-50 text-red-500" : "text-ink-600 hover:bg-surface-100")}>
                  {listening ? <MicOff strokeWidth={1.75} className="h-5 w-5" /> : <Mic strokeWidth={1.75} className="h-5 w-5" />}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Upload"
                  className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-ink-600 hover:bg-surface-100 cursor-pointer transition-colors">
                  <UploadCloud strokeWidth={1.75} className="h-5 w-5" />
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={handleFileChange} className="sr-only" />
              </div>
              {file && (
                <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                  <FileText strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0" />
                  <span className="text-xs font-medium text-brand-700 truncate">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="ml-auto text-brand-600 hover:text-brand-700 cursor-pointer"><X strokeWidth={1.75} className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {listening && <div className="px-5 pb-3"><span className="text-xs text-red-500 animate-pulse font-medium">Listening…</span></div>}
            </div>

            {(text.trim() || file) && (
              <div className="mt-3 flex items-center justify-center">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required
                  className="h-10 w-56 rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-600 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors" />
              </div>
            )}
            {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}

            <div className="mt-5 flex items-center justify-center gap-3">
              <button type="submit" disabled={state === "submitting"}
                className="h-10 px-5 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 cta-glow">
                {state === "submitting" ? <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analyzing…</span> : "Get My SVI"}
              </button>
              <button type="button" onClick={() => { setText(QUICK_EXAMPLES[Math.floor(Math.random() * QUICK_EXAMPLES.length)]); textareaRef.current?.focus(); }}
                className="h-10 px-5 rounded-xl border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer">
                Try an Example
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-ink-600">Free · No credit card · Drag &amp; drop a PDF · Voice input</p>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { setText(ex); textareaRef.current?.focus(); }}
                className="rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs text-ink-600 hover:border-brand-300 hover:text-brand-700 cursor-pointer transition-colors">
                {ex}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5 VALUE PROPS ─────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-14">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {VALUE_PROPS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl bg-white border border-surface-200 px-4 py-5 text-center shadow-sm card-hover">
                <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                  <Icon strokeWidth={1.75} className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-ink-800">{title}</p>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOUNDER'S ROADMAP ─────────────────────────────────────────────── */}
      <section className="bg-white py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-ink-800 mb-2">The Smart Founder&apos;s Roadmap</h2>
          <p className="text-center text-sm text-ink-600 mb-10">10 steps from idea to investment — BlockID guides you at every stage.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {ROADMAP_STEPS.map(({ num, icon: Icon, title, desc, href }) => (
              <Link key={num} href={href}
                className="group rounded-xl border border-surface-200 bg-white px-4 py-4 hover:border-brand-300 hover:shadow-md transition-all">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-6 w-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">{num}</span>
                  <Icon strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
                </div>
                <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">{title}</p>
                <p className="text-[11px] text-ink-600 mt-1 leading-relaxed">{desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TIERS ────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-14">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl md:text-3xl font-bold text-ink-800 mb-2">Choose Your Starting Point</h2>
          <p className="text-center text-sm text-ink-600 mb-10">Validate your idea or unlock the full platform — start today.</p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Idea/MVP Value Report — $25 */}
            <div className="rounded-2xl border border-surface-200 bg-white px-8 py-8 text-center shadow-sm flex flex-col">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">One-off Report</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">Idea/MVP Value Report</h3>
              <p className="text-3xl font-extrabold text-brand-600 mb-4">AUD $25</p>
              <p className="text-sm text-ink-600 mb-6 leading-relaxed">
                AI-powered 10-page startup analysis report. Includes market validation,
                competitive landscape, revenue model, cap table guidance, investor readiness
                checklist, and actionable next steps.
              </p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Market validation analysis</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Competitive landscape</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Revenue model &amp; cap table guidance</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Investor readiness checklist</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Actionable next steps</li>
              </ul>
              <div className="mt-auto">
                <a href="#svi" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Get Your Report &mdash; $25 <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </a>
                <p className="mt-3 text-xs text-ink-500">Use code <span className="font-semibold text-brand-600">BLOCKID25</span> for $25 off your first Founding 50 account</p>
              </div>
            </div>

            {/* Founding 50 — $49 */}
            <div className="rounded-2xl border border-brand-200 bg-white px-8 py-8 text-center shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-4 right-4 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">Best Value</div>
              <p className="text-xs uppercase tracking-[0.15em] text-brand-600 font-medium mb-2">Limited Offer</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">Founding 50 Account</h3>
              <p className="text-3xl font-extrabold text-brand-600 mb-1">AUD $49 <span className="text-base text-ink-600 line-through font-normal ml-1">$99</span></p>
              <p className="text-xs text-ink-500 mb-4">Lifetime access &middot; Only 50 spots</p>
              <p className="text-sm text-ink-600 mb-6 leading-relaxed">
                Lifetime SVI account, cap table starter, evidence vault, export packs, and 30-day growth plan.
              </p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Everything in Idea/MVP Report</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Lifetime SVI dashboard access</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Cap table &amp; equity tools</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Evidence vault &amp; export packs</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 30-day growth plan</li>
              </ul>
              <div className="mt-auto">
                <Link href="/founding-50" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Claim Your Founding 50 Spot <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM BENEFITS BAR ───────────────────────────────────────────── */}
      <section className="bg-ink-800 text-white py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <div className="flex items-center gap-3 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-official.png" alt="BlockID.au" className="h-11 md:h-12 w-auto" />
              <div>
                <p className="text-lg font-bold">Your Idea Is Valuable.</p>
                <p className="text-xs text-slate-400">How you build it determines its future value.</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
              {BOTTOM_BENEFITS.map(({ title, desc }) => (
                <div key={title} className="flex items-start gap-2">
                  <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-white">{title}</p>
                    <p className="text-[10px] text-slate-400 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <a href="#svi" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white hover:bg-brand-600 transition-colors cta-glow">
              Get Started Free <ArrowRight strokeWidth={2} className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-slate-500">Build it right. Build it valuable. Build it with BlockID.au</p>
          </div>
        </div>
      </section>

      <BottomFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
function TopBar() {
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const toolsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: MouseEvent) => { if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [toolsOpen]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-surface-200">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-official.png" alt="BlockID.au" className="h-11 md:h-12 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          <div ref={toolsRef} className="relative">
            <button type="button" onClick={() => setToolsOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-ink-600 hover:text-ink-800 cursor-pointer rounded-lg hover:bg-surface-100 transition-colors">
              Tools <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 opacity-60" />
            </button>
            {toolsOpen && (
              <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-xl border border-surface-200 bg-white shadow-lg p-1.5 z-50">
                {TOOLS.map((t) => (
                  <Link key={t.href} href={t.href} onClick={() => setToolsOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-surface-100 hover:text-ink-800 transition-colors">{t.label}</Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/founding-50" className="px-3 py-2 text-sm text-ink-600 hover:text-ink-800 rounded-lg hover:bg-surface-100 transition-colors">Founding 50</Link>
          <Link href="/dashboard/svi" className="px-3 py-2 text-sm text-ink-600 hover:text-ink-800 rounded-lg hover:bg-surface-100 transition-colors">Dashboard</Link>
          <Link href="/auth/login" className="ml-2 h-9 px-5 inline-flex items-center justify-center rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 transition-all cursor-pointer">Sign in</Link>
        </nav>

        <button type="button" onClick={() => setMobileOpen((v) => !v)} className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg text-ink-600 hover:bg-surface-100 cursor-pointer">
          {mobileOpen ? <X strokeWidth={1.75} className="h-5 w-5" /> : <Menu strokeWidth={1.75} className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
            <Link href="/" className="inline-flex items-center" onClick={() => setMobileOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-official.png" alt="BlockID.au" className="h-11 md:h-12 w-auto" />
            </Link>
            <button type="button" onClick={() => setMobileOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-lg text-ink-600 hover:bg-surface-100 cursor-pointer">
              <X strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>
          <nav className="px-4 py-4 flex flex-col gap-1">
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.15em] text-ink-600 font-semibold">Free Tools</p>
            {TOOLS.map((t) => (<Link key={t.href} href={t.href} onClick={() => setMobileOpen(false)} className="px-3 py-2.5 text-sm text-ink-700 hover:bg-surface-100 rounded-lg transition-colors">{t.label}</Link>))}
            <div className="my-2 border-t border-surface-200" />
            <Link href="/founding-50" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-100 rounded-lg">Founding 50</Link>
            <Link href="/dashboard/svi" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-100 rounded-lg">Dashboard</Link>
            <div className="my-2 border-t border-surface-200" />
            <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="mx-3 h-10 flex items-center justify-center rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">Sign in</Link>
          </nav>
        </div>
      )}
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
function BottomFooter() {
  return (
    <footer className="bg-ink-900 text-sm text-slate-400 border-t border-ink-700">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-slate-500">Australia</span>
            <Link href="/about" className="hover:text-slate-200 transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-slate-200 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-200 transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-slate-200 transition-colors">Contact</Link>
            <Link href="/investors" className="hover:text-slate-200 transition-colors">Investors</Link>
          </div>
          <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} Auschain Pty Ltd. Not financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
