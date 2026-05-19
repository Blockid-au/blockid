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
  Lock,
  Menu,
  Mic,
  MicOff,
  PieChart,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { SVIResultsPanel } from "@/components/svi/svi-results-panel";
import { RndResultsPanel } from "@/components/svi/rnd-results-panel";
import { RndStatusBar } from "@/components/svi/rnd-status-bar";
import { CreditGate } from "@/components/ui/credit-gate";
import { isEarlyBird } from "@/lib/plans";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import type { RndReport } from "@/lib/rnd-types";

import { useSearchParams, useRouter } from "next/navigation";

type SubmitState = "idle" | "submitting" | "done" | "error";

const SVI_FREE_USED_KEY = "blockid_svi_free_used";

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
  const [rndStatus, setRndStatus] = React.useState<string | null>(null);
  const [rndReport, setRndReport] = React.useState<RndReport | null>(null);
  const [detectedInputType, setDetectedInputType] = React.useState<"url" | "document" | "idea" | null>(null);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [hasPaidPlan, setHasPaidPlan] = React.useState(false);
  const [analysisPaidToast, setAnalysisPaidToast] = React.useState(false);
  const [creditGate, setCreditGate] = React.useState<{
    open: boolean;
    balance: number;
    cost: number;
    feature: string;
  }>({ open: false, balance: 0, cost: 0, feature: "svi_analysis" });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Server-side gate check ────────────────────────────────────────────
  const checkGate = React.useCallback(async (emailToCheck: string) => {
    if (!emailToCheck.includes("@")) return;
    try {
      const res = await fetch(`/api/svi/check-gate?email=${encodeURIComponent(emailToCheck)}`);
      const data = await res.json();
      if (!data.canAnalyze) {
        setShowPaywall(true);
      } else {
        setShowPaywall(false);
      }
    } catch { /* ignore — gate stays in current state */ }
  }, []);

  // Handle ?analysis_paid=true — verify credits server-side after payment.
  React.useEffect(() => {
    if (searchParams.get("analysis_paid") === "true") {
      const paidEmail = searchParams.get("email") ?? "";
      // Pre-fill the email from the payment (ref-based to avoid lint warning).
      if (paidEmail && emailRef.current !== paidEmail) {
        emailRef.current = paidEmail;
        queueMicrotask(() => setEmail(paidEmail));
      }
      // Clear the localStorage gate (supplementary cache).
      if (typeof window !== "undefined") {
        localStorage.removeItem(SVI_FREE_USED_KEY);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async gate check after payment redirect
      if (paidEmail) { checkGate(paidEmail); } else { setShowPaywall(false); }
      setAnalysisPaidToast(true);
      // Clean the URL params without a full page reload.
      const url = new URL(window.location.href);
      url.searchParams.delete("analysis_paid");
      url.searchParams.delete("email");
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
      // Auto-dismiss toast after 5 seconds.
      const timer = setTimeout(() => setAnalysisPaidToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, checkGate]);

  // Check if user is authenticated with a paid plan — skip the gate if so.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && data.user?.plan && data.user.plan !== "free") {
          setHasPaidPlan(true);
        }
      } catch {
        // Silently ignore — gate stays active.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // Detect input type from text content
  React.useEffect(() => {
    if (file) {
      setDetectedInputType("document");
    } else if (text.trim()) {
      const trimmed = text.trim();
      const isUrl = /^https?:\/\//i.test(trimmed) || /^(www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed);
      setDetectedInputType(isUrl ? "url" : "idea");
    } else {
      setDetectedInputType(null);
    }
  }, [text, file]);

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
    trackEvent("svi_voice_input", {});
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); trackEvent("svi_file_uploaded", { file_type: f.name.split(".").pop() ?? "unknown" }); } };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) { setFile(f); trackEvent("svi_file_uploaded", { file_type: f.name.split(".").pop() ?? "unknown" }); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) { setError("Please enter a valid email address."); return; }
    const rawText = file ? `File: ${file.name}\n${text}` : text;
    if (!rawText.trim() && !file) { setError("Please describe your idea or upload a document."); return; }

    // ── Free-analysis gate ──────────────────────────────────────────────
    // Paid users bypass the gate entirely. Otherwise, check localStorage
    // as a fast cache, then the server is the source of truth via 402.
    if (!hasPaidPlan) {
      const freeUsed = typeof window !== "undefined" && localStorage.getItem(SVI_FREE_USED_KEY);
      if (freeUsed) {
        // localStorage says used — but verify server-side (user may have purchased credits)
        try {
          const gateRes = await fetch(`/api/svi/check-gate?email=${encodeURIComponent(email)}`);
          const gateData = await gateRes.json();
          if (!gateData.canAnalyze) {
            setShowPaywall(true);
            trackEvent("svi_paywall_shown", {});
            return;
          }
          // Server says they can analyze (credits/paid) — clear localStorage cache
          localStorage.removeItem(SVI_FREE_USED_KEY);
        } catch {
          // If gate check fails, fall through to let the API enforce
        }
      }
    }

    setError(""); setState("submitting"); setRndStatus(null); setRndReport(null);
    trackEvent("svi_submitted", { method: file ? "file" : "text", has_file: !!file });

    const inputPayload = {
      email,
      input: {
        rawText: rawText.trim() || `Business plan document: ${file?.name}`,
        fileName: file?.name,
      },
    };

    // ── Try R&D Agent (SSE) first, fallback to /api/svi ────────────────
    try {
      const res = await fetch("/api/rnd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputPayload),
      });

      // Server-side gate enforcement: 402 = limit reached or insufficient credits
      if (res.status === 402) {
        const gateData = await res.json();
        if (gateData.error === "Insufficient credits" && typeof gateData.balance === "number" && typeof gateData.cost === "number") {
          setCreditGate({
            open: true,
            balance: gateData.balance,
            cost: gateData.cost,
            feature: "svi_analysis",
          });
          setState("idle");
          trackEvent("svi_credit_gate_shown", { balance: gateData.balance, cost: gateData.cost });
          return;
        }
        setShowPaywall(true);
        setState("idle");
        trackEvent("svi_paywall_shown", {});
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      // ── SSE stream from /api/rnd ─────────────────────────────────────
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sseCompleted = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ") && eventType) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (eventType === "status") {
                    setRndStatus(data.message);
                  } else if (eventType === "complete") {
                    setResult({
                      ok: true,
                      slug: data.slug,
                      totalSVI: data.totalSVI,
                      analysis: data.analysis,
                      persisted: true,
                    });
                    setRndReport(data.report ?? null);
                    setRndStatus(null);
                    setState("done");
                    sseCompleted = true;
                    trackEvent("rnd_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });
                  } else if (eventType === "error") {
                    setError(data.error || "Analysis failed");
                    setRndStatus(null);
                    setState("error");
                  }
                } catch {
                  // Malformed JSON in SSE data — skip
                }
                eventType = "";
              }
            }
          }
        } catch {
          // Stream interrupted — if we already have results, keep them
          if (!sseCompleted) {
            // Fall through to fallback
            throw new Error("SSE stream interrupted");
          }
        }

        // Mark free analysis as used in localStorage
        if (sseCompleted && !hasPaidPlan && typeof window !== "undefined") {
          localStorage.setItem(SVI_FREE_USED_KEY, "true");
        }
        return;
      }

      // ── Non-SSE response from /api/rnd (JSON fallback) ───────────────
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          // /api/rnd returned error JSON — fall through to /api/svi
          throw new Error(data.error || "R&D API returned error");
        }
        setResult({
          ok: true,
          slug: data.slug,
          totalSVI: data.totalSVI,
          analysis: data.analysis,
          persisted: data.persisted ?? true,
        });
        setRndReport(data.report ?? null);
        setState("done");
        trackEvent("rnd_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });
        if (!hasPaidPlan && typeof window !== "undefined") {
          localStorage.setItem(SVI_FREE_USED_KEY, "true");
        }
        return;
      }

      // Unexpected content type — fall through to /api/svi
      throw new Error("Unexpected response from /api/rnd");
    } catch {
      // ── Fallback: original /api/svi ──────────────────────────────────
      setRndStatus(null);
      try {
        const sviRes = await fetch("/api/svi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputPayload),
        });

        if (sviRes.status === 402) {
          const gateData = await sviRes.json();
          if (gateData.error === "Insufficient credits" && typeof gateData.balance === "number" && typeof gateData.cost === "number") {
            setCreditGate({
              open: true,
              balance: gateData.balance,
              cost: gateData.cost,
              feature: "svi_analysis",
            });
            setState("idle");
            trackEvent("svi_credit_gate_shown", { balance: gateData.balance, cost: gateData.cost });
            return;
          }
          setShowPaywall(true);
          setState("idle");
          trackEvent("svi_paywall_shown", {});
          return;
        }

        const data = (await sviRes.json()) as SVIApiResponse;
        if (!data.ok) { setError("Analysis failed. Please try again."); setState("error"); return; }
        setResult(data); setState("done");
        trackEvent("svi_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });

        if (!hasPaidPlan && typeof window !== "undefined") {
          localStorage.setItem(SVI_FREE_USED_KEY, "true");
        }
      } catch { setError("Network error. Please try again."); setState("error"); }
    }
  };

  const handleReset = () => { setResult(null); setRndReport(null); setRndStatus(null); setState("idle"); setText(""); setFile(null); setEmail(""); setError(""); };

  // Called when a 100% coupon grants free access — clear gate and re-submit.
  const handleCouponGrant = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SVI_FREE_USED_KEY);
    }
    setShowPaywall(false);
    setHasPaidPlan(true); // Treat as paid for the rest of this session.
    // Server-side: the coupon flow handles its own DB logic; we just
    // unblock the UI here. The API route will re-check on submit.
  };

  // ── Results view
  if (state === "done" && result) {
    return (
      <div className="min-h-svh bg-surface-100 flex flex-col">
        <header className="px-6 py-5 flex items-center justify-between max-w-2xl mx-auto w-full">
          <Link href="/" className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-icon-transparent.png" alt="" className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
          </Link>
          <button type="button" onClick={handleReset} className="text-xs text-ink-600 hover:text-ink-800 cursor-pointer transition-colors flex items-center gap-1.5">
            <X strokeWidth={1.75} className="h-3.5 w-3.5" /> New analysis
          </button>
        </header>
        <main className="flex-1 px-4 pb-12">
          {rndReport ? (
            <RndResultsPanel
              report={rndReport}
              analysis={result.analysis}
              slug={result.slug}
              email={email}
              isPaid={hasPaidPlan}
              onReset={handleReset}
              onUnlock={() => setShowPaywall(true)}
            />
          ) : (
            <SVIResultsPanel analysis={result.analysis} slug={result.slug} onReset={handleReset} rawText={text} email={email} />
          )}
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
      <section className="relative overflow-hidden gradient-hero pt-28 md:pt-32 pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.02em] leading-[1.05] text-ink-900">
                The <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">agentic AI valuation</span> platform for business growth from day one.
              </h1>
              <p className="mt-5 text-lg md:text-xl font-medium text-brand-600/80">
                Index valuation, ownership, and execution milestones from idea to scale.
              </p>
              <p className="mt-5 text-base md:text-lg text-ink-500 leading-relaxed max-w-xl">
                BlockID.au helps founders, startups, and SMEs build a clear foundation for
                valuation, ownership, and execution from day one — tracking value creation,
                contributor alignment, capitalization, and investor-ready records as the
                business grows.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#svi" className="inline-flex h-14 items-center gap-2 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Start Your Journey <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </a>
                <Link href="/tools/idea-valuation" className="inline-flex h-14 items-center gap-2 rounded-2xl border border-surface-300 bg-white px-8 text-base font-semibold text-ink-700 hover:bg-surface-100 transition-colors">
                  Explore Platform <Rocket strokeWidth={1.75} className="h-4 w-4" />
                </Link>
              </div>
            </div>
            {/* Right: platform overview banner */}
            <div className="relative rounded-3xl shadow-2xl overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/blockid-hero-banner.png"
                alt="BlockID.au — Turn your idea into a valuable, investable business. Cap Table, Valuation, AI Workspace."
                className="w-full h-auto"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>

          {/* 4 Pillars */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-5">
            {PILLARS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center rounded-2xl border border-surface-200/80 bg-white/80 backdrop-blur px-5 py-6 shadow-sm card-hover">
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
      <section id="svi" className="gradient-section py-20 md:py-28">
        <div className="mx-auto max-w-[620px] px-6 flex flex-col items-center">
          <div className="flex flex-col items-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex items-center gap-4 mb-6 animate-fade-in">
              <img src="/images/logo-icon-transparent.png" alt="" className="h-14 w-14 md:h-16 md:w-16" />
              <div className="flex flex-col">
                <span className="text-4xl md:text-5xl font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
                <span className="text-sm md:text-base font-medium tracking-wide text-ink-500 mt-0.5">Valuation. Ownership. Execution. Growth.</span>
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center text-ink-900">
              Get Your <span className="text-brand-600">Startup Value Index</span>
            </h2>
            <p className="mt-3 text-base text-ink-500">Free AI-powered analysis in under 60 seconds</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full">
            <div className={cn(
              "w-full rounded-[28px] border transition-all duration-200",
              searchFocused
                ? "border-brand-400 shadow-glow-pulse"
                : text
                  ? "border-brand-400 shadow-[0_0_0_3px_rgba(37,99,235,0.1)]"
                  : "border-surface-300 hover:shadow-[0_1px_6px_rgba(32,33,36,0.18)]",
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

            {/* Input type badge */}
            {detectedInputType && (
              <div className="mt-2 flex justify-center animate-fade-in">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                  detectedInputType === "url"
                    ? "border border-brand-200 bg-brand-50 text-brand-700"
                    : detectedInputType === "document"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-surface-300 bg-surface-50 text-ink-600",
                )}>
                  {detectedInputType === "url" && <><Search strokeWidth={1.75} className="h-3 w-3" /> URL Detected</>}
                  {detectedInputType === "document" && <><FileText strokeWidth={1.75} className="h-3 w-3" /> Document Detected</>}
                  {detectedInputType === "idea" && <><Lightbulb strokeWidth={1.75} className="h-3 w-3" /> Idea Analysis</>}
                </span>
              </div>
            )}

            {/* R&D Status Bar — streaming status during analysis */}
            <RndStatusBar status={rndStatus} isActive={state === "submitting"} />

            {(text.trim() || file) && (
              <div className="mt-3 flex items-center justify-center">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={(e) => checkGate(e.target.value)} placeholder="your@email.com" required
                  className="h-10 w-56 rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-600 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors" />
              </div>
            )}
            {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}

            <div className="mt-5 flex items-center justify-center gap-3">
              <button type="submit" disabled={state === "submitting"}
                className="h-11 px-6 rounded-2xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 cta-glow">
                {state === "submitting" ? <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analyzing…</span> : "Get My SVI"}
              </button>
              <button type="button" onClick={() => { setText(QUICK_EXAMPLES[Math.floor(Math.random() * QUICK_EXAMPLES.length)]); textareaRef.current?.focus(); trackEvent("svi_form_started", { method: "example" }); }}
                className="h-10 px-5 rounded-xl border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer">
                Try an Example
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-ink-600">Free · No credit card · Drag &amp; drop a PDF · Voice input</p>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { setText(ex); textareaRef.current?.focus(); }}
                className="rounded-full border border-surface-200 bg-white px-4 py-2 text-xs font-medium text-ink-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors">
                {ex}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5 VALUE PROPS ─────────────────────────────────────────────────── */}
      <section className="bg-white py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {VALUE_PROPS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl bg-surface-50 border border-surface-200/60 px-5 py-6 text-center card-hover">
                <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
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
      <section className="gradient-section py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl md:text-4xl font-bold text-ink-900 mb-2">The Smart Founder&apos;s Roadmap</h2>
          <p className="text-center text-base text-ink-500 mb-10">10 steps from idea to investment — BlockID guides you at every stage.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {ROADMAP_STEPS.map(({ num, icon: Icon, title, desc, href }) => (
              <Link key={num} href={href}
                className="group rounded-2xl border border-surface-200/80 bg-white px-5 py-5 hover:border-brand-200 hover:shadow-lg transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-7 w-7 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center justify-center">{num}</span>
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
            {/* Card 1: Per-Analysis */}
            <div className="rounded-2xl border border-surface-200 bg-white px-8 py-8 text-center shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-4 right-4 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">Launch Price &middot; Limited Time</div>
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Per-Analysis</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">SVI Analysis Report</h3>
              <p className="text-3xl font-extrabold text-brand-600 mb-1">A$1 <span className="text-base text-ink-400 line-through font-normal ml-1">$25</span></p>
              <p className="text-xs text-emerald-600 font-semibold mb-4">Early-bird until June 15, 2026</p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 1st analysis free &mdash; no signup needed</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 10-page AI-powered report</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Action buttons on recommendations</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Shareable link</li>
              </ul>
              <div className="mt-auto">
                <a href="#svi" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Try Free &mdash; Then A$1/report <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Card 2: Founder Plan */}
            <div className="rounded-2xl border-2 border-brand-400 bg-white px-8 py-8 text-center shadow-lg flex flex-col relative overflow-hidden">
              <div className="absolute top-4 right-4 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">Best Value</div>
              <p className="text-xs uppercase tracking-[0.15em] text-brand-600 font-medium mb-2">Founder Plan</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">Founding 50 Account</h3>
              <p className="text-3xl font-extrabold text-brand-600 mb-1">A$49 <span className="text-base text-ink-400 line-through font-normal ml-1">$99</span></p>
              <p className="text-xs text-ink-500 mb-4">Lifetime access &middot; Only 50 spots</p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 50 credits included</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Unlimited dashboard</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Evidence vault</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Cap table tools</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Export packs</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Growth plan</li>
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
              <img src="/images/logo-icon-transparent.png" alt="" className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
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

      {/* ── ANALYSIS PAID TOAST ──────────────────────────────────────── */}
      {analysisPaidToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] animate-fade-in">
          <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-5 py-3 shadow-lg">
            <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-green-600 shrink-0" />
            <span className="text-sm font-medium text-green-800">Payment confirmed! Enter your idea below.</span>
            <button
              type="button"
              onClick={() => setAnalysisPaidToast(false)}
              className="ml-2 h-6 w-6 flex items-center justify-center rounded-full text-green-600 hover:bg-green-100 cursor-pointer transition-colors"
              aria-label="Dismiss"
            >
              <X strokeWidth={1.75} className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── PAYWALL OVERLAY ──────────────────────────────────────────── */}
      {showPaywall && (
        <SVIPaywall
          onClose={() => setShowPaywall(false)}
          onCouponGrant={handleCouponGrant}
          email={email}
        />
      )}

      {/* ── CREDIT GATE MODAL ───────────────────────────────────────── */}
      <CreditGate
        isOpen={creditGate.open}
        onClose={() => setCreditGate((prev) => ({ ...prev, open: false }))}
        feature={creditGate.feature}
        cost={creditGate.cost}
        balance={creditGate.balance}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paywall overlay — shown after the first free analysis is consumed.
// ═══════════════════════════════════════════════════════════════════════════════
function SVIPaywall({
  onClose,
  onCouponGrant,
  email: parentEmail,
}: {
  onClose: () => void;
  onCouponGrant: () => void;
  email?: string;
}) {
  const [couponCode, setCouponCode] = React.useState("");
  const [couponState, setCouponState] = React.useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [couponMsg, setCouponMsg] = React.useState("");
  const [checkoutLoading, setCheckoutLoading] = React.useState<"analysis" | "plan" | null>(null);
  const [analysisEmail, setAnalysisEmail] = React.useState(parentEmail ?? "");
  const [analysisError, setAnalysisError] = React.useState("");

  const earlyBird = isEarlyBird();
  const analysisPrice = earlyBird ? 1 : 25;

  /** Checkout for a single A$1/$25 analysis (no auth required). */
  const handleAnalysisCheckout = async () => {
    const trimmedEmail = analysisEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setAnalysisError("Please enter a valid email address.");
      return;
    }
    setAnalysisError("");
    setCheckoutLoading("analysis");
    trackEvent("svi_paywall_analysis_click", { price: analysisPrice });
    try {
      const res = await fetch("/api/stripe/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setAnalysisError(data.reason || "Could not start checkout. Please try again.");
      }
    } catch {
      setAnalysisError("Network error. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  /** Checkout for the Founding 50 plan (requires auth). */
  const handlePlanCheckout = async () => {
    setCheckoutLoading("plan");
    trackEvent("svi_paywall_checkout_click", {});
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "founding50" }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/login?plan=founding50";
        return;
      }
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setCouponMsg(data.reason || "Could not start checkout. Please try again.");
        setCouponState("error");
      }
    } catch {
      setCouponMsg("Network error. Please try again.");
      setCouponState("error");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCouponValidate = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponState("validating");
    setCouponMsg("");
    trackEvent("svi_paywall_coupon_submit", { code });
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok && data.discount_pct === 100) {
        setCouponState("success");
        setCouponMsg("Free access granted!");
        setTimeout(() => onCouponGrant(), 1200);
      } else if (data.ok) {
        setCouponState("idle");
        setCouponMsg(
          `${data.discount_pct}% discount applied. Proceed to checkout to use it.`
        );
      } else {
        setCouponState("error");
        setCouponMsg(data.reason || "Invalid coupon code.");
      }
    } catch {
      setCouponState("error");
      setCouponMsg("Could not validate coupon. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto py-8">
      <div className="relative mx-4 w-full max-w-lg rounded-3xl border border-surface-200 bg-white px-8 py-10 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-surface-100 cursor-pointer transition-colors"
          aria-label="Close"
        >
          <X strokeWidth={1.75} className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-200">
          <Lock strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
        </div>

        <h3 className="text-center text-xl font-bold text-ink-900">
          You&apos;ve already used your free Startup Value Index analysis.
        </h3>
        <p className="mt-2 text-center text-sm text-ink-500 leading-relaxed">
          To analyze another idea, choose an option below.
        </p>

        {/* ── Option A: Single Analysis ────────────────────────────────── */}
        <div className="mt-6 rounded-2xl border border-surface-200 bg-surface-50 px-5 py-5">
          <p className="text-xs uppercase tracking-[0.12em] font-semibold text-ink-400 mb-1">Option A</p>
          <p className="text-sm font-bold text-ink-800">Single Analysis</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-brand-600">${analysisPrice} AUD</span>
            {earlyBird && (
              <span className="text-sm text-ink-400 line-through">$25</span>
            )}
          </div>
          {earlyBird && (
            <p className="mt-1 text-xs text-brand-600 font-medium">
              Early-bird price until June 15, 2026
            </p>
          )}

          {/* Email input for guest checkout */}
          <input
            type="email"
            value={analysisEmail}
            onChange={(e) => { setAnalysisEmail(e.target.value); if (analysisError) setAnalysisError(""); }}
            placeholder="your@email.com"
            className="mt-3 h-10 w-full rounded-xl border border-surface-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
          />
          {analysisError && (
            <p className="mt-1.5 text-xs text-red-500">{analysisError}</p>
          )}

          <button
            type="button"
            onClick={handleAnalysisCheckout}
            disabled={checkoutLoading !== null}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 h-11 text-sm font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 cta-glow"
          >
            {checkoutLoading === "analysis" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Redirecting...
              </span>
            ) : (
              <>Get This Analysis &mdash; ${analysisPrice} AUD</>
            )}
          </button>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 border-t border-surface-200" />
          <span className="text-xs text-ink-400">or</span>
          <div className="flex-1 border-t border-surface-200" />
        </div>

        {/* ── Option B: Unlimited (Founding 50) ────────────────────────── */}
        <div className="rounded-2xl border border-brand-200 bg-white px-5 py-5 relative overflow-hidden">
          <div className="absolute top-3 right-3 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">Best Value</div>
          <p className="text-xs uppercase tracking-[0.12em] font-semibold text-brand-600 mb-1">Option B</p>
          <p className="text-sm font-bold text-ink-800">Unlimited Access</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-brand-600">$49 AUD</span>
            <span className="text-sm text-ink-400 line-through">$99</span>
          </div>
          <p className="mt-1 text-xs text-ink-500">Unlimited analyses + Evidence Vault + more</p>

          <button
            type="button"
            onClick={handlePlanCheckout}
            disabled={checkoutLoading !== null}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 h-11 text-sm font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 cta-glow"
          >
            {checkoutLoading === "plan" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Redirecting...
              </span>
            ) : (
              <>
                <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                Get Founder Plan &mdash; $49 AUD
              </>
            )}
          </button>

          {/* Features list */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              "Unlimited SVI analyses",
              "Evidence vault",
              "Export packs",
              "Cap table tools",
              "30-day growth plan",
              "Lifetime access",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-1.5">
                <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                <span className="text-xs text-ink-600">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Coupon input */}
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <input
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); if (couponState === "error") { setCouponState("idle"); setCouponMsg(""); } }}
                placeholder="Enter coupon code"
                className="h-10 w-full rounded-xl border border-surface-300 bg-surface-50 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCouponValidate(); } }}
              />
            </div>
            <button
              type="button"
              onClick={handleCouponValidate}
              disabled={couponState === "validating" || !couponCode.trim()}
              className="h-10 px-4 rounded-xl border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              {couponState === "validating" ? "..." : "Apply"}
            </button>
          </div>
          {couponMsg && (
            <p className={cn(
              "mt-2 text-center text-xs font-medium",
              couponState === "success" ? "text-green-600" : couponState === "error" ? "text-red-500" : "text-brand-600",
            )}>
              {couponState === "success" && <CheckCircle2 strokeWidth={1.75} className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
              {couponMsg}
            </p>
          )}
        </div>

        {/* Sign in link */}
        <p className="mt-4 text-center text-sm text-ink-500">
          Already have an account?{" "}
          <a
            href="/auth/login?plan=founding50"
            className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            Sign in
          </a>
        </p>
      </div>
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
          <img src="/images/logo-icon-transparent.png" alt="" className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
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
              <img src="/images/logo-icon-transparent.png" alt="" className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
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
