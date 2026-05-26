"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { SVIResultsPanel } from "@/components/svi/svi-results-panel";
import { RndResultsPanel } from "@/components/svi/rnd-results-panel";
import { RndStatusBar, type StatusEntry } from "@/components/svi/rnd-status-bar";
import { CreditGate } from "@/components/ui/credit-gate";
import { SectionPicker, type SectionSelection } from "@/components/svi/section-picker";
import { LanguageToggle } from "@/components/ui/language-toggle";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import type { RndReport, ClientTechAuditResult } from "@/lib/rnd-types";

import Image from "next/image";
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
  { href: "/tools/esic", label: "ESIC Checker" },
  { href: "/tools/rnd-tax", label: "R&D Tax Calculator" },
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
  const [rndStatusEntries, setRndStatusEntries] = React.useState<StatusEntry[]>([]);
  const addRndStatus = (step: string, message: string) => setRndStatusEntries((prev) => [...prev, { step, message, ts: Date.now() }]);
  const clearRndStatus = () => setRndStatusEntries([]);
  const [rndReport, setRndReport] = React.useState<RndReport | null>(null);
  const [techAudit, setTechAudit] = React.useState<ClientTechAuditResult | null>(null);
  // detectedInputType is now a useMemo — see below
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [hasPaidPlan, setHasPaidPlan] = React.useState(false);
  const [lastInput, setLastInput] = React.useState<{ rawText: string; fileName?: string } | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = React.useState<SVIAnalysis | null>(null);
  const [analysisPaidToast, setAnalysisPaidToast] = React.useState(false);
  const [creditGate, setCreditGate] = React.useState<{
    open: boolean;
    balance: number;
    cost: number;
    feature: string;
  }>({ open: false, balance: 0, cost: 0, feature: "svi_analysis" });
  const [showSectionPicker, setShowSectionPicker] = React.useState(false);
  const [sectionPickerCredits, setSectionPickerCredits] = React.useState(0);
  const [sectionPickerLoading, setSectionPickerLoading] = React.useState(false);
  const [modularReport, setModularReport] = React.useState<Record<string, { markdown: string; wordCount: number }> | null>(null);
  const [selectedStage, setSelectedStage] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef("");
  const hasTrackedStart = React.useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Capture referral code from URL ────────────────────────────────────
  React.useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode && typeof window !== "undefined") {
      localStorage.setItem("blockid_ref", refCode);
      // Also set a cookie so the server (Google auth) can read it.
      document.cookie = `blockid_ref=${encodeURIComponent(refCode)};path=/;max-age=${60 * 60 * 24 * 30};samesite=lax`;
    }
  }, [searchParams]);

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
        // If user has credits or a paid plan, mark as paid to skip future gate checks
        if (data.reason === "credits" || data.reason === "paid_plan") {
          setHasPaidPlan(true);
        }
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
      // After payment, immediately clear paywall and mark as paid so the
      // next submit bypasses the gate entirely. The server will re-verify
      // credits on the actual API call.
      setShowPaywall(false);
      setHasPaidPlan(true);
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
  }, [searchParams, router]);

  // Logged-in user state — auto-fill email, show avatar, skip gate
  const [loggedInUser, setLoggedInUser] = React.useState<{
    email: string;
    displayName: string | null;
    plan: string | null;
  } | null>(null);

  // Project selector for logged-in users
  const [projects, setProjects] = React.useState<Array<{ id: string; slug: string; name: string }>>([]);
  const [selectedProject, setSelectedProject] = React.useState<string>(""); // slug or "__new__"
  const [projectDropdownOpen, setProjectDropdownOpen] = React.useState(false);

  // Check if user is authenticated with a paid plan — skip the gate if so.
  // Also triggers after a login redirect (detected via ?logged_in=true).
  const justLoggedIn = searchParams.get("logged_in") === "true";
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && data.user) {
          setLoggedInUser({
            email: data.user.email,
            displayName: data.user.displayName,
            plan: data.user.plan,
          });
          // Auto-fill email from logged-in user
          if (data.user.email && !email) {
            setEmail(data.user.email);
          }
          if (data.user.plan && data.user.plan !== "free") {
            setHasPaidPlan(true);
          }
          // Load user's projects for the selector
          try {
            const projRes = await fetch("/api/projects");
            const projData = await projRes.json();
            if (projData.ok && projData.projects?.length > 0) {
              setProjects(projData.projects);
              // Read current active project from cookie
              const cookieMatch = document.cookie.match(/blockid_project=([^;]+)/);
              if (cookieMatch) {
                setSelectedProject(cookieMatch[1]);
              } else {
                setSelectedProject(projData.projects[0].slug);
              }
            }
          } catch { /* no projects yet */ }
        }
      } catch {
        // Silently ignore — gate stays active.
      }
    })();
    // Clean the logged_in param from the URL without a full page reload.
    if (justLoggedIn) {
      const url = new URL(window.location.href);
      url.searchParams.delete("logged_in");
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
    }
    return () => { cancelled = true; };
  }, [justLoggedIn, router]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // Derive input type from text content (no effect needed)
  const detectedInputType = React.useMemo(() => {
    if (file) return "document";
    if (text.trim()) {
      const trimmed = text.trim();
      const isUrl = /^https?:\/\//i.test(trimmed) || /^(www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed);
      return isUrl ? "url" : "idea";
    }
    return null;
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
    let rawText = file ? `File: ${file.name}\n${text}` : text;
    if (!rawText.trim() && !file) { setError("Please describe your idea or upload a document."); return; }
    if (selectedStage) rawText = `${rawText}\n\nStartup stage: ${selectedStage}`;

    // ── Free-analysis gate (1 per day) ────────────────────────────────
    // Paid users bypass the gate entirely. Otherwise, check localStorage
    // as a fast cache (timestamp), then the server is the source of truth.
    if (!hasPaidPlan) {
      const lastUsedStr = typeof window !== "undefined" && localStorage.getItem(SVI_FREE_USED_KEY);
      const lastUsed = lastUsedStr ? Number(lastUsedStr) : 0;
      const isWithin24h = Date.now() - lastUsed < 24 * 60 * 60 * 1000;
      if (isWithin24h) {
        // localStorage says used today — but verify server-side (user may have purchased credits)
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

    setError(""); setState("submitting"); clearRndStatus(); setRndReport(null); setTechAudit(null); setPreviousAnalysis(null);
    trackEvent("svi_submitted", { method: file ? "file" : "text", has_file: !!file });

    // ── Auto-create project for logged-in users ────────────────────────
    if (loggedInUser && selectedProject === "__new__") {
      try {
        // AI will name the project from the input text — use first 60 chars as fallback
        const autoName = rawText.trim().slice(0, 60).replace(/\n/g, " ") || "My Startup";
        const projRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: autoName }),
        });
        const projData = await projRes.json();
        if (projData.ok && projData.project) {
          const newSlug = projData.project.slug;
          document.cookie = `blockid_project=${newSlug};path=/;max-age=${365 * 86400};samesite=lax`;
          setSelectedProject(newSlug);
          setProjects(prev => [...prev, { id: projData.project.id, slug: newSlug, name: projData.project.name }]);
        }
      } catch { /* continue — project creation is non-blocking */ }
    } else if (loggedInUser && selectedProject && selectedProject !== "__new__") {
      // Ensure the cookie is set for the selected project
      document.cookie = `blockid_project=${selectedProject};path=/;max-age=${365 * 86400};samesite=lax`;
    }

    // Fetch previous analysis for delta comparison (fire-and-forget, don't block)
    try {
      const prevRes = await fetch(`/api/svi/latest?email=${encodeURIComponent(email)}`);
      if (prevRes.ok) {
        const prevData = await prevRes.json();
        if (prevData.ok && prevData.analysis?.analysisJson) {
          setPreviousAnalysis(prevData.analysis.analysisJson as SVIAnalysis);
        }
      }
    } catch { /* ignore — delta display simply won't show */ }

    const trimmedRawText = rawText.trim() || `Business plan document: ${file?.name}`;
    const inputPayload = {
      email,
      input: {
        rawText: trimmedRawText,
        fileName: file?.name,
      },
    };

    // Save input so we can re-submit for Deep Dive later
    setLastInput({ rawText: trimmedRawText, fileName: file?.name });

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
                    addRndStatus(data.step ?? "progress", data.message);
                  } else if (eventType === "complete") {
                    setResult({
                      ok: true,
                      slug: data.slug,
                      totalSVI: data.totalSVI,
                      analysis: data.analysis,
                      persisted: true,
                    });
                    setRndReport(data.report ?? null);
                    setTechAudit(data.techAudit ?? null);
                    clearRndStatus();
                    setState("done");
                    sseCompleted = true;
                    trackEvent("rnd_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });
                    { const ft = !localStorage.getItem("blockid_first_report_done"); trackEvent("first_report_completed", { svi_score: data.totalSVI, is_first_time: ft }); if (ft) localStorage.setItem("blockid_first_report_done", "1"); }
                    if (typeof window !== "undefined") {
                      try {
                        const saved = JSON.parse(localStorage.getItem("blockid_analyses") ?? "[]");
                        const entry = {
                          slug: data.slug,
                          totalSVI: data.totalSVI,
                          stage: data.analysis?.stage ?? 0,
                          stageLabel: data.analysis?.stageLabel ?? "",
                          summary: data.analysis?.summary?.slice(0, 150) ?? "",
                          createdAt: new Date().toISOString(),
                          inputPreview: text.slice(0, 100),
                          email,
                        };
                        const updated = [entry, ...saved.filter((a: any) => a.slug !== data.slug)].slice(0, 20);
                        localStorage.setItem("blockid_analyses", JSON.stringify(updated));
                      } catch {}
                    }
                    // Auto-scroll to results after analysis completes
                    queueMicrotask(() => {
                      const resultsEl = document.getElementById("svi-results");
                      if (resultsEl) {
                        resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    });
                  } else if (eventType === "error") {
                    setError(data.error || "Analysis failed");
                    clearRndStatus();
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
          localStorage.setItem(SVI_FREE_USED_KEY, String(Date.now()));
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
        setTechAudit(data.techAudit ?? null);
        setState("done");
        trackEvent("rnd_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem("blockid_analyses") ?? "[]");
            const entry = {
              slug: data.slug,
              totalSVI: data.totalSVI,
              stage: data.analysis?.stage ?? 0,
              stageLabel: data.analysis?.stageLabel ?? "",
              summary: data.analysis?.summary?.slice(0, 150) ?? "",
              createdAt: new Date().toISOString(),
              inputPreview: text.slice(0, 100),
              email,
            };
            const updated = [entry, ...saved.filter((a: any) => a.slug !== data.slug)].slice(0, 20);
            localStorage.setItem("blockid_analyses", JSON.stringify(updated));
          } catch {}
        }
        // Auto-scroll to results after analysis completes
        queueMicrotask(() => {
          const resultsEl = document.getElementById("svi-results");
          if (resultsEl) {
            resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        if (!hasPaidPlan && typeof window !== "undefined") {
          localStorage.setItem(SVI_FREE_USED_KEY, String(Date.now()));
        }
        return;
      }

      // Unexpected content type — fall through to /api/svi
      throw new Error("Unexpected response from /api/rnd");
    } catch {
      // ── Fallback: original /api/svi ──────────────────────────────────
      clearRndStatus();
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
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem("blockid_analyses") ?? "[]");
            const entry = {
              slug: data.slug,
              totalSVI: data.totalSVI,
              stage: data.analysis?.stage ?? 0,
              stageLabel: data.analysis?.stageLabel ?? "",
              summary: data.analysis?.summary?.slice(0, 150) ?? "",
              createdAt: new Date().toISOString(),
              inputPreview: text.slice(0, 100),
              email,
            };
            const updated = [entry, ...saved.filter((a: any) => a.slug !== data.slug)].slice(0, 20);
            localStorage.setItem("blockid_analyses", JSON.stringify(updated));
          } catch {}
        }
        const isFirstTime = !localStorage.getItem("blockid_first_report_done");
        trackEvent("svi_analysis_complete", { svi_score: data.totalSVI, slug: data.slug });
        trackEvent("first_report_completed", { svi_score: data.totalSVI, is_first_time: isFirstTime });
        if (isFirstTime) localStorage.setItem("blockid_first_report_done", "1");
        // Auto-scroll to results after analysis completes
        queueMicrotask(() => {
          const resultsEl = document.getElementById("svi-results");
          if (resultsEl) {
            resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });

        if (!hasPaidPlan && typeof window !== "undefined") {
          localStorage.setItem(SVI_FREE_USED_KEY, String(Date.now()));
        }
      } catch { setError("Network error. Please try again."); setState("error"); }
    }
  };

  const handleDeepDiveUpgrade = async () => {
    if (!email || !result || !lastInput) return;
    clearRndStatus();
    addRndStatus("rnd_start", "Upgrading to Deep Dive...");
    setState("submitting");
    trackEvent("rnd_deep_dive_upgrade", { from_tier: rndReport?.tier ?? "standard" });

    try {
      const res = await fetch("/api/rnd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          input: { rawText: lastInput.rawText, fileName: lastInput.fileName },
          tier: "deep_dive",
        }),
      });

      if (res.status === 402) {
        const gateData = await res.json();
        if (gateData.error === "Insufficient credits" && typeof gateData.balance === "number" && typeof gateData.cost === "number") {
          setCreditGate({ open: true, balance: gateData.balance, cost: gateData.cost, feature: "svi_analysis" });
          setState("done");
          trackEvent("svi_credit_gate_shown", { balance: gateData.balance, cost: gateData.cost });
          return;
        }
        setShowPaywall(true);
        setState("done");
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
                  addRndStatus(data.step ?? "progress", data.message);
                } else if (eventType === "complete") {
                  setResult({
                    ok: true,
                    slug: data.slug,
                    totalSVI: data.totalSVI,
                    analysis: data.analysis,
                    persisted: true,
                  });
                  setRndReport(data.report ?? null);
                  setTechAudit(data.techAudit ?? null);
                  clearRndStatus();
                  setState("done");
                  trackEvent("rnd_deep_dive_complete", { svi_score: data.totalSVI, slug: data.slug });
                } else if (eventType === "error") {
                  setError(data.error || "Deep Dive upgrade failed");
                  clearRndStatus();
                  setState("done");
                }
              } catch {
                // Malformed JSON — skip
              }
              eventType = "";
            }
          }
        }
        return;
      }

      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "Deep Dive upgrade failed");
          setState("done");
          return;
        }
        setResult({
          ok: true,
          slug: data.slug,
          totalSVI: data.totalSVI,
          analysis: data.analysis,
          persisted: data.persisted ?? true,
        });
        setRndReport(data.report ?? null);
        setTechAudit(data.techAudit ?? null);
        setState("done");
        trackEvent("rnd_deep_dive_complete", { svi_score: data.totalSVI, slug: data.slug });
        return;
      }

      setError("Unexpected response from Deep Dive upgrade");
      setState("done");
    } catch {
      setError("Deep Dive upgrade failed. Please try again.");
      setState("done");
    }
  };

  const handleReset = () => { setResult(null); setRndReport(null); setTechAudit(null); clearRndStatus(); setState("idle"); setText(""); setFile(null); setEmail(""); setError(""); setLastInput(null); setPreviousAnalysis(null); setSelectedStage(null); };

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

  // Called when user wants to open the Custom Sections picker
  const handleOpenSectionPicker = async () => {
    setShowPaywall(false);
    try {
      const res = await fetch("/api/credits");
      const data = await res.json();
      if (data.ok) setSectionPickerCredits(data.balance ?? 0);
    } catch { /* fallback to 0 */ }
    setShowSectionPicker(true);
    trackEvent("svi_section_picker_opened", {});
  };

  // Called when user confirms section selections from the picker
  const handleSectionPickerConfirm = async (selections: SectionSelection) => {
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      setShowSectionPicker(false);
      return;
    }
    const rawText = file ? `File: ${file.name}\n${text}` : text;
    if (!rawText.trim()) {
      setError("Please describe your idea or upload a document first.");
      setShowSectionPicker(false);
      return;
    }

    setSectionPickerLoading(true);
    trackEvent("svi_modular_submitted", { sectionCount: selections.length });

    try {
      const res = await fetch("/api/svi/modular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, rawText: rawText.trim(), sections: selections }),
      });

      if (res.status === 401) {
        setError("Please sign in to use Custom Sections.");
        setShowSectionPicker(false);
        setSectionPickerLoading(false);
        return;
      }
      if (res.status === 402) {
        const gateData = await res.json();
        setCreditGate({ open: true, balance: gateData.balance ?? 0, cost: gateData.cost ?? 0, feature: "modular_report" });
        setShowSectionPicker(false);
        setSectionPickerLoading(false);
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Modular analysis failed.");
        setSectionPickerLoading(false);
        return;
      }

      setModularReport(data.sections);
      setShowSectionPicker(false);
      setSectionPickerLoading(false);
      setState("done");
      trackEvent("svi_modular_complete", { sectionCount: Object.keys(data.sections).length, totalCredits: data.totalCredits });
    } catch {
      setError("Network error. Please try again.");
      setSectionPickerLoading(false);
    }
  };

  // ── Modular report results view
  if (state === "done" && modularReport && !result) {
    const sectionNames: Record<string, string> = {
      executive: "Executive Summary", market: "Market & Problem", product: "Product & Technology",
      business: "Business Model", competition: "Competition & Moat", traction: "Traction & Growth",
      team: "Team & Execution", financial: "Financial Projections", risk: "Risk Assessment",
      recommendations: "Recommendations",
    };
    return (
      <div id="svi-results" className="min-h-svh bg-surface-100 flex flex-col">
        <Navbar />
        <div className="px-6 pt-20 pb-2 flex items-center justify-end max-w-2xl mx-auto w-full">
          <button type="button" onClick={() => { handleReset(); setModularReport(null); }} className="text-xs text-ink-600 hover:text-ink-800 cursor-pointer transition-colors flex items-center gap-1.5">
            <X strokeWidth={1.75} className="h-3.5 w-3.5" /> New analysis
          </button>
        </div>
        <main className="flex-1 px-4 pb-12">
          <div className="mx-auto max-w-[680px]">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-medium mb-2">Custom Modular Report</p>
              <h2 className="text-2xl font-bold text-ink-900">{Object.keys(modularReport).length} Sections Generated</h2>
              <p className="text-sm text-ink-500 mt-1">
                {Object.values(modularReport).reduce((sum, s) => sum + s.wordCount, 0).toLocaleString()} words total
              </p>
            </div>
            <div className="space-y-6">
              {Object.entries(modularReport).map(([sectionId, data]) => (
                <div key={sectionId} className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-ink-900 mb-1">{sectionNames[sectionId] ?? sectionId}</h3>
                  <p className="text-xs text-ink-500 mb-4">{data.wordCount} words</p>
                  <div className="prose prose-sm max-w-none text-ink-700 leading-relaxed whitespace-pre-wrap">{data.markdown}</div>
                </div>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Results view
  if (state === "done" && result) {
    return (
      <div id="svi-results" className="min-h-svh bg-surface-100 flex flex-col">
        <Navbar />
        <main className="flex-1 px-4 pt-24 pb-12">
          {rndReport ? (
            <>
              {/* First-time report congratulations banner */}
              {typeof window !== "undefined" && localStorage.getItem("blockid_first_report_done") === "1" && !localStorage.getItem("blockid_first_banner_dismissed") && (
                <div className="mx-auto max-w-[620px] px-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 relative">
                    <button type="button" onClick={() => { localStorage.setItem("blockid_first_banner_dismissed", "1"); }} className="absolute top-3 right-3 text-emerald-400 hover:text-emerald-600 text-xs cursor-pointer">Dismiss</button>
                    <p className="text-sm font-semibold text-emerald-800">Your first startup analysis is ready!</p>
                    <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                      This is your 10-page preview. To unlock deeper analysis with competitor profiles, financial projections, and 90-day action plans — select individual sections below or upgrade to the full report.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <a href="/workspace/evidence" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">Upload Evidence (+8-20 pts)</a>
                      <a href="/auth/login?next=/dashboard" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">Save to Dashboard</a>
                    </div>
                  </div>
                </div>
              )}
              {/* Sign-in encouragement banner for unauthenticated users */}
              {!loggedInUser && (
                <div className="mx-auto max-w-[620px] px-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-blue-50 p-5">
                    <p className="text-sm font-semibold text-brand-800">Sign in to unlock your full report</p>
                    <p className="text-xs text-brand-700 mt-1 leading-relaxed">
                      Create a free account to get <strong>5 bonus credits</strong> — enough for 10 analyses + report sections.
                      Your analysis is saved and waiting for you.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <a href={`/auth/login?next=/dashboard/svi`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
                        Sign In &amp; Get 5 Free Credits
                      </a>
                      <span className="text-[10px] text-brand-500">Use code <strong>LAUNCH50</strong> for 50% off</span>
                    </div>
                  </div>
                </div>
              )}
              <RndResultsPanel
                report={rndReport}
                analysis={result.analysis}
                slug={result.slug}
                email={email}
                isPaid={hasPaidPlan}
                onReset={handleReset}
                onUnlock={() => setShowPaywall(true)}
                onUpgradeDeepDive={handleDeepDiveUpgrade}
                previousAnalysis={previousAnalysis}
                techAudit={techAudit}
              />

              {/* Deep Dive upsell banner */}
              {rndReport.tier !== "deep_dive" && (
                <div className="mx-auto max-w-[620px] px-6 mt-6">
                  <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-amber-100/50 p-6 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-amber-500 mb-3" />
                    <h3 className="text-lg font-bold text-ink-800 mb-1">Want deeper insights?</h3>
                    <p className="text-sm text-ink-600 mb-4">
                      Upgrade to Deep Dive for detailed competitor profiles, financial models,
                      growth tactics, and a 90-day action plan.
                    </p>
                    <button
                      type="button"
                      onClick={handleDeepDiveUpgrade}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-6 text-sm font-semibold text-white hover:bg-amber-600 transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                      Deep Dive — 1.50 credits
                    </button>
                  </div>
                </div>
              )}

              {/* R&D Status Bar for Deep Dive upgrade */}
              <RndStatusBar entries={rndStatusEntries} isActive={rndStatusEntries.length > 0} />
            </>
          ) : (
            <SVIResultsPanel analysis={result.analysis} slug={result.slug} onReset={handleReset} rawText={text} email={email} previousAnalysis={previousAnalysis} />
          )}
        </main>

        <Footer />

        {/* Floating "View Results" banner — helps users who don't auto-scroll */}
        {result && state === "done" && (
          <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom duration-300">
            <button
              onClick={() => document.getElementById("svi-results")?.scrollIntoView({ behavior: "smooth" })}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              Your SVI Score is ready — View Results
            </button>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Full landing page
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-svh bg-white flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <TopBar />

      {/* ── SVI SEARCH SECTION (default view) ────────────────────────────── */}
      <section id="svi" className="min-h-[calc(100svh-56px)] md:min-h-[calc(100svh-64px)] flex items-start gradient-section bg-gradient-to-b from-brand-50/60 via-white to-white py-10 sm:py-12 md:py-20 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-brand-100/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-emerald-100/30 blur-3xl" />
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 flex flex-col items-center relative">
          <div className="flex flex-col items-center mb-5 sm:mb-8">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 animate-fade-in">
              <Image src="/images/logo-icon-transparent.png" alt="" width={64} height={64} className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16" />
              <div className="flex flex-col">
                <span className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
                <span className="text-xs sm:text-sm md:text-base font-medium tracking-wide text-ink-500 mt-0.5">Valuation. Ownership. Growth.</span>
              </div>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-center text-ink-900 leading-tight">
              <span className="block sm:inline">Get your Idea &amp;</span>
              <span className="block text-brand-600">Startup Value Index</span>
            </h2>
            <p className="mx-auto mt-3 sm:mt-4 max-w-md text-center text-base sm:text-lg text-ink-500">First analysis free. AI-powered results in under 60 seconds.</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full">
            {/* Project selector for logged-in users */}
            {loggedInUser && projects.length > 0 && (
              <div className="mb-3 flex items-center justify-center gap-2">
                <span className="text-xs text-ink-400">Project:</span>
                <div className="relative">
                  <button type="button" onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-brand-300 hover:bg-brand-50 transition-all cursor-pointer shadow-sm">
                    <Sparkles strokeWidth={1.75} className="h-3 w-3 text-brand-500" />
                    {selectedProject === "__new__" ? "New Project" : projects.find(p => p.slug === selectedProject)?.name || "Select project"}
                    <ChevronDown strokeWidth={1.75} className="h-3 w-3 text-ink-400" />
                  </button>
                  {projectDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-surface-200 bg-white shadow-lg z-50 py-1 animate-fade-in">
                      {projects.map(p => (
                        <button key={p.slug} type="button"
                          onClick={() => { setSelectedProject(p.slug); setProjectDropdownOpen(false); document.cookie = `blockid_project=${p.slug};path=/;max-age=${365*86400};samesite=lax`; }}
                          className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 transition-colors cursor-pointer flex items-center gap-2",
                            selectedProject === p.slug ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-700")}>
                          <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                          <span className="truncate">{p.name}</span>
                          {selectedProject === p.slug && <CheckCircle2 strokeWidth={2} className="h-3.5 w-3.5 text-brand-600 ml-auto shrink-0" />}
                        </button>
                      ))}
                      <div className="border-t border-surface-100 mt-1 pt-1">
                        <button type="button"
                          onClick={() => { setSelectedProject("__new__"); setProjectDropdownOpen(false); document.cookie = "blockid_project=;path=/;max-age=0"; }}
                          className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors cursor-pointer flex items-center gap-2",
                            selectedProject === "__new__" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-emerald-600")}>
                          <Rocket strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />
                          <span>+ New Startup Project</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="svi-input-glow rounded-2xl sm:rounded-[28px] shadow-lg">
              <div className="flex items-center px-3 py-3 sm:px-5 sm:py-4 gap-2 sm:gap-3">
                <Search strokeWidth={1.75} className="h-5 w-5 text-ink-600 shrink-0" />
                <textarea ref={textareaRef} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => { setSearchFocused(true); if (!hasTrackedStart.current) { trackEvent("svi_form_started", { method: "text" }); hasTrackedStart.current = true; } }} onBlur={() => setSearchFocused(false)}
                  placeholder="Describe your startup idea, business plan, or paste key details…" rows={1}
                  className="min-w-0 flex-1 resize-none text-base sm:text-lg text-ink-800 placeholder:text-ink-600 focus:outline-none bg-transparent leading-relaxed"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <button type="button" onClick={toggleVoice} aria-label={listening ? "Stop voice input" : "Start voice input"}
                  className={cn("shrink-0 h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full cursor-pointer transition-colors",
                    listening ? "bg-red-50 text-red-500" : "text-ink-600 hover:bg-surface-100")}>
                  {listening ? <MicOff strokeWidth={1.75} className="h-5 w-5" /> : <Mic strokeWidth={1.75} className="h-5 w-5" />}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Upload a file"
                  className="shrink-0 h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full text-ink-600 hover:bg-surface-100 cursor-pointer transition-colors">
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
              <div className="relative z-10 mt-4 flex justify-center animate-fade-in">
                <span className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-all",
                  detectedInputType === "url"
                    ? "border border-brand-200 bg-white text-brand-700"
                    : detectedInputType === "document"
                      ? "border border-emerald-200 bg-white text-emerald-700"
                      : "border border-surface-300 bg-white text-ink-600",
                )}>
                  {detectedInputType === "url" && <><Search strokeWidth={1.75} className="h-3 w-3" /> URL Detected</>}
                  {detectedInputType === "document" && <><FileText strokeWidth={1.75} className="h-3 w-3" /> Document Detected</>}
                  {detectedInputType === "idea" && <><Lightbulb strokeWidth={1.75} className="h-3 w-3" /> Idea Analysis</>}
                </span>
              </div>
            )}

            {/* Stage selector pills */}
            <div className="mt-4 flex flex-col items-center">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-400 font-medium mb-2">What stage is your startup?</p>
              <div className="flex flex-wrap justify-center gap-2">
                {([
                  { value: "Idea (Stage 0)", label: "Idea", Icon: Lightbulb },
                  { value: "Validated (Stage 1)", label: "Validated", Icon: CheckCircle2 },
                  { value: "MVP (Stage 2)", label: "MVP", Icon: Zap },
                  { value: "Traction (Stage 3)", label: "Traction", Icon: PieChart },
                  { value: "Revenue (Stage 4)", label: "Revenue", Icon: Bot },
                  { value: "Growth (Stage 5+)", label: "Growth", Icon: Rocket },
                ] as const).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSelectedStage(selectedStage === s.value ? null : s.value)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium cursor-pointer transition-colors",
                      selectedStage === s.value
                        ? "bg-brand-600 text-white"
                        : "bg-surface-100 text-ink-600 hover:bg-surface-200",
                    )}
                  >
                    <s.Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* R&D Status Bar — streaming status during analysis */}
            <RndStatusBar entries={rndStatusEntries} isActive={state === "submitting"} />

            <div className="mt-3 flex items-center justify-center">
              {loggedInUser ? (
                <div className="flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 pl-3 pr-4 py-1.5">
                  <div className="h-6 w-6 rounded-full bg-brand-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {(loggedInUser.displayName ?? loggedInUser.email)[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-brand-700 font-medium">{loggedInUser.email}</span>
                  <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
                </div>
              ) : (
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={(e) => checkGate(e.target.value)} placeholder="your@email.com" required
                  className="h-10 w-full max-w-56 rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-600 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors" />
              )}
            </div>
            {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}

            {/* Credit cost indicator — show BEFORE submit so user knows upfront */}
            {(text.trim() || file) && !loggedInUser && (
              <div className="mt-3 flex items-center justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 strokeWidth={2} className="h-3 w-3" />
                  This analysis is FREE — no credits needed
                </span>
              </div>
            )}
            {(text.trim() || file) && loggedInUser && (
              <div className="mt-3 flex items-center justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-medium text-brand-700">
                  Cost: <span className="font-mono font-bold">0.50</span> credits &middot; Includes 10-page report + summaries
                </span>
              </div>
            )}

            <div className="mt-4 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="submit" disabled={state === "submitting"}
                className="h-12 w-full max-w-xs px-8 rounded-2xl bg-brand-600 text-base font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed cta-glow sm:w-auto">
                {state === "submitting" ? <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analyzing…</span> : "Get My SVI — Free"}
              </button>
              <button type="button" onClick={() => { setText(QUICK_EXAMPLES[Math.floor(Math.random() * QUICK_EXAMPLES.length)]); textareaRef.current?.focus(); trackEvent("svi_form_started", { method: "example" }); }}
                className="h-10 w-full max-w-xs px-5 rounded-xl border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer sm:w-auto">
                Try an Example
              </button>
            </div>
            <div className="mt-3 flex flex-col items-center gap-1.5">
              <p className="flex flex-wrap items-center justify-center gap-2 text-center text-sm font-semibold text-emerald-700">
                <CheckCircle2 strokeWidth={2} className="h-4 w-4 shrink-0 text-emerald-500" />
                5 free credits on signup &middot; No credit card required
              </p>
              <p className="text-xs text-ink-400">
                Early Bird: A$0.50/analysis (normally A$25) &middot; Expires July 1, 2026
              </p>
            </div>
            {/* Typing indicator hint — visible when textarea is empty */}
            {!text && state === "idle" && (
              <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-400" style={{ animationDelay: "0ms" }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-400" style={{ animationDelay: "150ms" }} />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-400" style={{ animationDelay: "300ms" }} />
                <span className="ml-2 text-xs text-ink-400">Describe your startup idea...</span>
              </div>
            )}
          </form>

          <div className="mt-6 flex flex-col items-center px-2 sm:px-0">
            <p className="text-xs font-medium text-brand-600 uppercase tracking-wider mb-3">Try an example</p>
            <div className="flex flex-wrap justify-center gap-2">
            {QUICK_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => { setText(ex); textareaRef.current?.focus(); }}
                className="example-chip rounded-full border-2 border-brand-200 bg-white px-4 sm:px-5 py-2.5 text-[11px] sm:text-xs font-semibold text-ink-600 hover:border-brand-500 hover:text-brand-700 hover:bg-brand-50 hover:shadow-md cursor-pointer transition-all duration-200">
                {ex}
              </button>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HERO SECTION ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden gradient-hero pt-28 md:pt-32 pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-brand-600 mb-6">
                The Ownership &amp; Growth Execution Platform
              </p>
              <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.02em] leading-[1.05] text-ink-900">
                Turn Your AI-Built Idea Into A <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">Valuable, Investable</span> Business.
              </h1>
              <p className="mt-6 text-base md:text-lg text-ink-500 leading-relaxed max-w-xl">
                BlockID.au helps AI-native founders, startups, and private companies
                structure ownership, manage valuation, execute growth, and become
                investor-ready from day one.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row flex-wrap gap-4">
                <a href="#svi" className="inline-flex h-14 sm:h-16 items-center justify-center gap-2.5 rounded-2xl bg-brand-600 px-8 sm:px-10 text-base sm:text-lg font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Start Your Journey <ArrowRight strokeWidth={2} className="h-5 w-5" />
                </a>
                <Link href="/tools/idea-valuation" className="inline-flex h-14 sm:h-16 items-center justify-center gap-2.5 rounded-2xl border border-surface-300 bg-white/80 backdrop-blur-sm px-8 sm:px-10 text-base sm:text-lg font-semibold text-ink-700 hover:bg-surface-100 transition-colors">
                  Explore Platform <Rocket strokeWidth={1.75} className="h-5 w-5" />
                </Link>
              </div>
            </div>
            {/* Right: platform overview banner */}
            <div className="relative rounded-3xl shadow-2xl overflow-hidden bg-white">
              <Image
                src="/images/blockid-hero-banner.png"
                alt="BlockID.au — Turn your idea into a valuable, investable business. Cap Table, Valuation, AI Workspace."
                width={1200}
                height={675}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>

          {/* 4 Pillars */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {PILLARS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center rounded-2xl border border-surface-200/80 bg-white/80 backdrop-blur px-5 py-6 shadow-sm bento-card">
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

      {/* ── ABOUT / MISSION ──────────────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-white to-surface-50">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-center text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-4">Why BlockID.au</p>
          <h2 className="text-center text-2xl md:text-3xl font-extrabold tracking-tight text-ink-900 mb-6">
            The infrastructure layer for <span className="text-brand-600">AI-native startups</span>
          </h2>
          <div className="space-y-4 text-base text-ink-600 leading-relaxed">
            <p>
              Today, AI tools make it easy to build MVPs quickly — but most founders still struggle to turn those products into structured, investable businesses. They often lack clear ownership structure, valuation visibility, investor readiness, governance workflows, and growth execution systems.
            </p>
            <p>
              <strong className="text-ink-800">BlockID.au helps founders move from idea &rarr; MVP &rarr; investment &rarr; scale</strong> by combining ownership management, cap tables, valuation intelligence, investor readiness, growth execution workflows, and secure data rooms in one trusted platform.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: ShieldCheck, label: "Ownership & Cap Table", desc: "Structure equity, vesting, ESOP from day one" },
              { icon: TrendingUp, label: "Valuation Intelligence", desc: "Track SVI score and investor readiness in real-time" },
              { icon: Rocket, label: "Growth Execution", desc: "Data rooms, fundraise tools, and 90-day action plans" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-xl border border-surface-200 bg-white p-5 text-center">
                <div className="mx-auto mb-3 h-10 w-10 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                  <Icon strokeWidth={1.75} className="h-5 w-5" />
                </div>
                <p className="text-sm font-bold text-ink-800">{label}</p>
                <p className="text-xs text-ink-500 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ────────────────────────────────────────────────────── */}
      <section className="py-10 md:py-14 relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-6">
          <div className="trust-glass-strip rounded-2xl px-8 py-8 md:py-10">
            <p className="text-center text-xs uppercase tracking-[0.2em] text-brand-600 font-medium mb-6">
              Where AI meets startup valuation
            </p>
            <h2 className="text-center text-2xl md:text-3xl font-extrabold tracking-tight text-ink-900 mb-8">
              You build with AI.{" "}
              <span className="text-brand-600">We value what you build.</span>
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
              {[
                { num: "50+", label: "Australian founders" },
                { num: "200+", label: "SVI analyses" },
                { num: "$2M+", label: "Valuations tracked" },
              ].map(({ num, label }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-2xl md:text-3xl font-extrabold font-mono tabular-nums text-brand-600">{num}</span>
                  <span className="text-sm text-ink-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHERE AI MEETS STARTUP VALUATION (Problem/Solution) ────────── */}
      <section className="py-16 md:py-20 bg-surface-100">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center mt-0 text-sm text-ink-500 max-w-2xl mx-auto mb-10">
            AI assistants like ChatGPT and Claude are great for building products.
            But when it comes to valuing your company, splitting equity with co-founders,
            managing cap tables, and preparing for investors — you need a purpose-built platform.
          </p>

          {/* Problem / Solution grid */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* The problem */}
            <div className="rounded-2xl border border-surface-300 bg-white p-6 bento-card">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-xl bg-surface-200 flex items-center justify-center">
                  <Search strokeWidth={1.75} className="h-5 w-5 text-ink-500" />
                </div>
                <div>
                  <p className="font-semibold text-ink-800">The gap AI chat can&apos;t fill</p>
                  <p className="text-xs text-ink-500">Common founder challenges</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "How much is my startup idea actually worth?",
                  "How do I split equity fairly with co-founders?",
                  "What share should new team members get?",
                  "How much dilution happens when investors come in?",
                  "How do I track company value as it grows?",
                  "How do I prepare a cap table for fundraising?",
                  "How do I prove my startup's progress to investors?",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-ink-600">
                    <X className="h-4 w-4 mt-0.5 shrink-0 text-gold-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* The solution */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-6 ring-1 ring-brand-100 bento-card">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 rounded-xl bg-brand-600 flex items-center justify-center">
                  <Image src="/images/logo-icon-transparent.png" alt="" width={24} height={24} className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-ink-900">BlockID.au solves this</p>
                  <p className="text-xs text-brand-600">Works alongside your AI tools</p>
                </div>
              </div>
              <ul className="space-y-3">
                {[
                  "AI-powered valuation from Day 0 — Startup Value Index",
                  "Fair equity split calculator for co-founders & team",
                  "ESOP & vesting management for new members",
                  "Dilution modeling when investors come in",
                  "Living report that tracks growth over time",
                  "Cap table, data room & investor-ready documents",
                  "Evidence vault — prove progress, raise your score",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-ink-700">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Complementary message */}
          <p className="text-center mt-8 text-sm text-ink-500 max-w-xl mx-auto">
            Keep using ChatGPT, Claude, or Gemini to build your product.
            Use BlockID to value it, structure ownership, and get investor-ready.
          </p>

          {/* Bottom CTA */}
          <div className="text-center mt-8">
            <a href="#svi" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-8 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
              Value Your Idea Free <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-ink-500">
              No signup required. First analysis is free.
            </p>
          </div>
        </div>
      </section>

      {/* ── VIDEO SECTION ──────────────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-2xl md:text-3xl font-extrabold tracking-tight text-ink-900 mb-3">
            See How It Works
          </h2>
          <p className="text-center text-base text-ink-500 mb-8 max-w-xl mx-auto">
            Watch how BlockID helps founders go from idea to investor-ready in minutes.
          </p>
          <div className="relative w-full rounded-2xl overflow-hidden shadow-xl border border-surface-200" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/gaDT5svw1dQ?rel=0"
              title="BlockID.au — How It Works"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ── 5 VALUE PROPS — Bento Grid ────────────────────────────────────── */}
      <section className="bg-white py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          {/* Row 1: 2 large cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            {VALUE_PROPS.slice(0, 2).map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className={cn("rounded-2xl bg-surface-100 border border-surface-200/60 px-7 py-8 bento-card relative overflow-hidden", i === 0 ? "value-card-accent-blue" : "value-card-accent-emerald")}>
                <div className="mb-4 h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                  <Icon strokeWidth={1.75} className="h-7 w-7" />
                </div>
                <p className="text-lg font-extrabold text-ink-900">{title}</p>
                <p className="text-sm text-ink-600 mt-2 leading-relaxed max-w-md">{desc}</p>
              </div>
            ))}
          </div>
          {/* Row 2: 3 smaller cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {VALUE_PROPS.slice(2).map(({ icon: Icon, title, desc }, i) => {
              const accents = ["value-card-accent-gold", "value-card-accent-emerald", "value-card-accent-blue"];
              return (
                <div key={title} className={cn("rounded-2xl bg-surface-100 border border-surface-200/60 px-5 py-6 text-center bento-card relative overflow-hidden", accents[i])}>
                  <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-ink-800">{title}</p>
                  <p className="text-xs text-ink-600 mt-1 leading-relaxed">{desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FOUNDER'S ROADMAP — Horizontal Timeline ────────────────────── */}
      <section className="gradient-section py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl md:text-4xl font-extrabold text-ink-900 mb-2">The Smart Founder&apos;s Roadmap</h2>
          <p className="text-center text-base text-ink-500 mb-10">10 steps from idea to investment — BlockID guides you at every stage.</p>
          <div className="relative">
            {/* Scroll arrows (desktop) */}
            <button type="button" aria-label="Scroll roadmap left" onClick={() => { const el = document.getElementById("roadmap-scroll"); if (el) el.scrollBy({ left: -280, behavior: "smooth" }); }}
              className="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-white border border-surface-300 shadow-md hover:bg-surface-100 transition-colors cursor-pointer">
              <ChevronLeft className="h-5 w-5 text-ink-700" />
            </button>
            <button type="button" aria-label="Scroll roadmap right" onClick={() => { const el = document.getElementById("roadmap-scroll"); if (el) el.scrollBy({ left: 280, behavior: "smooth" }); }}
              className="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-white border border-surface-300 shadow-md hover:bg-surface-100 transition-colors cursor-pointer">
              <ChevronRight className="h-5 w-5 text-ink-700" />
            </button>
            {/* Scrollable container */}
            <div id="roadmap-scroll" className="roadmap-scroll flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth" role="list">
              {ROADMAP_STEPS.map(({ num, icon: Icon, title, desc, href }, i) => (
                <Link key={num} href={href} role="listitem"
                  className="group roadmap-card relative flex-shrink-0 w-56 rounded-2xl border border-surface-200/80 bg-white px-5 py-5 bento-card snap-start">
                  {/* Connecting line */}
                  {i < ROADMAP_STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-5 w-5 h-0.5 bg-brand-200" aria-hidden="true" />
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-8 w-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">{num}</span>
                    <Icon strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
                  </div>
                  <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">{title}</p>
                  <p className="text-[11px] text-ink-600 mt-1 leading-relaxed">{desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING TIERS ────────────────────────────────────────────────── */}
      <section className="bg-surface-100 py-14">
        <div className="mx-auto max-w-5xl px-6">
          {/* Free analysis banner */}
          <div className="mx-auto max-w-lg mb-10 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-brand-50 px-6 py-4 text-center shadow-sm">
            <p className="text-base font-bold text-emerald-800 flex items-center justify-center gap-2">
              <Zap strokeWidth={1.75} className="h-5 w-5 text-emerald-600" /> Your first SVI analysis is completely free.
            </p>
            <p className="text-sm text-emerald-700 mt-1">No signup needed. Just describe your idea and go.</p>
          </div>
          <h2 className="text-center text-2xl md:text-3xl font-bold text-ink-800 mb-2">Choose Your Starting Point</h2>
          <p className="text-center text-sm text-ink-600 mb-10">Validate your idea or unlock the full platform — start today.</p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Card 1: Per-Analysis */}
            <div className="rounded-2xl border border-surface-200 bg-white px-5 sm:px-8 py-8 text-center shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 rounded-full bg-emerald-600 px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider">Launch Price</div>
              <p className="text-xs uppercase tracking-[0.15em] text-ink-500 font-medium mb-2">Per-Analysis</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">SVI Analysis Report</h3>
              <p className="text-2xl sm:text-3xl font-extrabold text-brand-600 mb-1">A$0.50 <span className="text-base text-ink-400 line-through font-normal ml-1">$25</span></p>
              <p className="text-xs text-emerald-600 font-semibold mb-4">Fractional credits — pay only for what you use</p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 1st analysis free &mdash; no signup needed</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 10-page AI-powered report</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Action buttons on recommendations</li>
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> Shareable link</li>
              </ul>
              <div className="mt-auto">
                <a href="#svi" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cta-glow">
                  Try Free &mdash; Then 0.50 credits/report <ArrowRight strokeWidth={2} className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Card 2: Founder Plan */}
            <div className="rounded-2xl border-2 border-brand-400 bg-white px-5 sm:px-8 py-8 text-center shadow-lg flex flex-col relative overflow-hidden">
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 rounded-full bg-brand-600 px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider">Best Value</div>
              <p className="text-xs uppercase tracking-[0.15em] text-brand-600 font-medium mb-2">Founder Plan</p>
              <h3 className="text-xl font-bold text-ink-800 mb-1">Founding 50 Account</h3>
              <p className="text-2xl sm:text-3xl font-extrabold text-brand-600 mb-1">A$49 <span className="text-base text-ink-400 line-through font-normal ml-1">$99</span></p>
              <p className="text-xs text-ink-500 mb-4">Lifetime access &middot; Only 50 spots</p>
              <ul className="text-left text-sm text-ink-700 space-y-2 mb-6 mx-auto max-w-xs">
                <li className="flex items-start gap-2"><CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" /> 100 credits included</li>
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
      <section className="gradient-brand text-white py-16 relative overflow-hidden">
        {/* Subtle aurora overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/5 to-black/10 pointer-events-none" />
        <div className="mx-auto max-w-6xl px-6 relative">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Image src="/images/logo-icon-transparent.png" alt="" width={28} height={28} className="h-7 w-7" />
              <span className="text-lg font-extrabold tracking-tight text-white">BlockID<span className="text-brand-200">.au</span></span>
            </div>
            <p className="text-xl md:text-2xl font-extrabold">Your Idea Is Valuable.</p>
            <p className="text-sm text-blue-200 mt-1">How you build it determines its future value.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-10">
            {BOTTOM_BENEFITS.map(({ title, desc }) => (
              <div key={title} className="glass-card-dark rounded-xl px-4 py-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-brand-200 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-white">{title}</p>
                    <p className="text-[10px] text-blue-200 leading-snug">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <a href="#svi" className="inline-flex h-13 items-center gap-2 rounded-xl bg-white px-8 text-base font-bold text-brand-700 hover:bg-brand-50 transition-colors shadow-lg hover:shadow-xl cta-glow-light">
              Get Started Free <ArrowRight strokeWidth={2} className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs text-blue-200">Build it right. Build it valuable. Build it with BlockID.au</p>
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
          onCustomSections={handleOpenSectionPicker}
          email={email}
        />
      )}

      {/* ── SECTION PICKER MODAL ────────────────────────────────────── */}
      {showSectionPicker && (
        <SectionPicker
          credits={sectionPickerCredits}
          loading={sectionPickerLoading}
          onConfirm={handleSectionPickerConfirm}
          onClose={() => { setShowSectionPicker(false); setSectionPickerLoading(false); }}
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
// Credit pack card — small reusable component for the paywall upsell.
// ═══════════════════════════════════════════════════════════════════════════════
function CreditPackCard({
  credits,
  price,
  label,
  desc,
  onClick,
  highlight,
  loading,
}: {
  credits: number;
  price: string;
  label: string;
  desc: string;
  onClick: () => void;
  highlight: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center justify-between rounded-2xl border p-4 transition-all hover:shadow-md w-full text-left cursor-pointer disabled:opacity-50",
        highlight
          ? "border-brand-500 bg-brand-50 shadow-sm"
          : "border-surface-200 bg-white hover:border-brand-300",
      )}
    >
      <div>
        <p className="text-sm font-bold text-ink-900">{label}</p>
        <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
      </div>
      <div className="text-right shrink-0 ml-3">
        {loading ? (
          <span className="h-4 w-4 rounded-full border-2 border-brand-300/30 border-t-brand-600 animate-spin inline-block" />
        ) : (
          <>
            <p className="text-lg font-bold text-brand-600">{price}</p>
            <p className="text-[10px] text-ink-500">
              {credits} credit{credits > 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paywall overlay — shown after the first free analysis is consumed.
// Displays credit pack upsell options and a Founding 50 upgrade link.
// ═══════════════════════════════════════════════════════════════════════════════
function SVIPaywall({
  onClose,
  onCouponGrant,
  onCustomSections,
  email: parentEmail,
}: {
  onClose: () => void;
  onCouponGrant: () => void;
  onCustomSections: () => void;
  email?: string;
}) {
  const [couponCode, setCouponCode] = React.useState("");
  const [couponState, setCouponState] = React.useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [couponMsg, setCouponMsg] = React.useState("");
  const [checkoutLoading, setCheckoutLoading] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState("");

  /** Purchase a credit pack via /api/credits (requires auth). */
  const handleCreditPack = async (amount: number, trackLabel: string) => {
    setCheckoutLoading(trackLabel);
    setErrorMsg("");
    trackEvent("svi_paywall_credit_pack_click", { pack: trackLabel, credits: amount });
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (res.status === 401) {
        // Not authenticated — redirect to login first.
        window.location.href = `/auth/login?redirect=${encodeURIComponent("/?analysis_paid=true")}`;
        return;
      }
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else if (data.ok && data.method === "direct") {
        // Dev fallback — credits granted directly; close the paywall.
        onClose();
      } else {
        setErrorMsg(data.reason || "Could not start checkout. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  /** Checkout for a single analysis via /api/stripe/analysis (no auth required). */
  const handleSingleAnalysis = async () => {
    const trimmedEmail = (parentEmail ?? "").trim();
    setCheckoutLoading("single");
    setErrorMsg("");
    trackEvent("svi_paywall_analysis_click", { price: 1 });
    try {
      const res = await fetch("/api/stripe/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail || undefined }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.reason || "Could not start checkout. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
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
      <div className="relative mx-4 w-full max-w-md rounded-3xl border border-surface-200 bg-white p-6 sm:p-8 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-surface-100 cursor-pointer transition-colors"
          aria-label="Close"
        >
          <X strokeWidth={1.75} className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <Sparkles strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
          </div>
          <h3 className="text-2xl font-bold text-ink-900">
            Your Free Analysis is Complete!
          </h3>
          <p className="mt-2 text-ink-500 text-sm leading-relaxed">
            Great start! Unlock more analyses to keep building your startup value.
          </p>
        </div>

        {/* Three options: Quick Report / Custom Sections / Founder Plan */}
        <div className="space-y-3">
          {/* Option A: Quick Report */}
          <CreditPackCard
            credits={0.5}
            price="0.50 cr"
            label="A. Quick Report"
            desc="3-page scan — all 10 sections at a glance"
            onClick={handleSingleAnalysis}
            highlight={false}
            loading={checkoutLoading === "single"}
          />

          {/* Option B: Custom Sections */}
          <button
            type="button"
            onClick={onCustomSections}
            className="flex items-center justify-between rounded-2xl border border-brand-500 bg-brand-50 p-4 transition-all hover:shadow-md w-full text-left cursor-pointer shadow-sm"
          >
            <div>
              <p className="text-sm font-bold text-ink-900">B. Custom Sections</p>
              <p className="text-xs text-ink-500 mt-0.5">Choose which sections and depth — pay only for what you need</p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-lg font-bold text-brand-600">from 0.10</p>
              <p className="text-[10px] text-ink-500">credits/section</p>
            </div>
          </button>

          {/* Option C: Founder Plan */}
          <button
            type="button"
            onClick={() => { trackEvent("svi_paywall_founding50_click", {}); window.location.href = "/founding-50"; }}
            className="flex items-center justify-between rounded-2xl border border-surface-200 bg-white p-4 transition-all hover:shadow-md w-full text-left cursor-pointer hover:border-brand-300"
          >
            <div>
              <p className="text-sm font-bold text-ink-900">C. Founder Plan</p>
              <p className="text-xs text-ink-500 mt-0.5">100 credits + unlimited platform access</p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-lg font-bold text-brand-600">A$49</p>
              <p className="text-[10px] text-ink-500">one-time</p>
            </div>
          </button>
        </div>

        {/* Credit pack upsell */}
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => handleCreditPack(5, "starter")}
            disabled={!!checkoutLoading}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {checkoutLoading === "starter" ? "..." : "Buy 5 credits (A$5)"}
          </button>
          <span className="text-xs text-ink-300">|</span>
          <button
            type="button"
            onClick={() => handleCreditPack(25, "growth")}
            disabled={!!checkoutLoading}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {checkoutLoading === "growth" ? "..." : "Buy 25 credits (A$20, save 20%)"}
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <p className="mt-3 text-center text-xs text-red-500">{errorMsg}</p>
        )}

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
  const [user, setUser] = React.useState<{ email: string; displayName: string | null } | null>(null);
  const toolsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok && data.user) {
          setUser({ email: data.user.email, displayName: data.user.displayName });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: MouseEvent) => { if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [toolsOpen]);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-surface-200">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center">
          <Image src="/images/logo-icon-transparent.png" alt="" width={28} height={28} className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
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
          <Link href="/insights" className="px-3 py-2 text-sm text-ink-600 hover:text-ink-800 rounded-lg hover:bg-surface-100 transition-colors">Insights</Link>
          <Link href="/dashboard/svi" className="px-3 py-2 text-sm text-ink-600 hover:text-ink-800 rounded-lg hover:bg-surface-100 transition-colors">Dashboard</Link>
          <LanguageToggle variant="icon" className="ml-1" />
          {user ? (
            <Link href="/dashboard/svi" className="ml-2 h-9 inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 hover:bg-brand-100 transition-colors">
              <span className="h-6 w-6 rounded-full bg-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                {(user.displayName ?? user.email)[0].toUpperCase()}
              </span>
              <span className="text-sm text-brand-700 font-medium max-w-[120px] truncate">{user.displayName ?? user.email.split("@")[0]}</span>
            </Link>
          ) : (
            <Link href="/auth/login" className="ml-2 h-9 px-5 inline-flex items-center justify-center rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 transition-all cursor-pointer">Sign in</Link>
          )}
        </nav>

        <button type="button" onClick={() => setMobileOpen((v) => !v)} className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg text-ink-600 hover:bg-surface-100 cursor-pointer">
          {mobileOpen ? <X strokeWidth={1.75} className="h-5 w-5" /> : <Menu strokeWidth={1.75} className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
            <Link href="/" className="inline-flex items-center" onClick={() => setMobileOpen(false)}>
              <Image src="/images/logo-icon-transparent.png" alt="" width={28} height={28} className="h-7 w-7" /><span className="ml-2.5 text-lg font-extrabold tracking-tight text-ink-900">BlockID<span className="text-brand-500">.au</span></span>
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
            <Link href="/insights" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-100 rounded-lg">Insights</Link>
            <Link href="/dashboard/svi" onClick={() => setMobileOpen(false)} className="px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-100 rounded-lg">Dashboard</Link>
            <div className="my-2 border-t border-surface-200" />
            {user ? (
              <Link href="/dashboard/svi" onClick={() => setMobileOpen(false)} className="mx-3 h-10 flex items-center justify-center gap-2 rounded-lg bg-brand-50 border border-brand-200 text-sm font-medium text-brand-700">
                <span className="h-6 w-6 rounded-full bg-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {(user.displayName ?? user.email)[0].toUpperCase()}
                </span>
                {user.displayName ?? user.email.split("@")[0]}
              </Link>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="mx-3 h-10 flex items-center justify-center rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700">Sign in</Link>
            )}
            <div className="flex justify-center pt-2 pb-1">
              <LanguageToggle variant="pill" />
            </div>
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
            <Link href="/insights" className="hover:text-slate-200 transition-colors">Insights</Link>
            <Link href="/investors" className="hover:text-slate-200 transition-colors">Investors</Link>
          </div>
          <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} Auschain Pty Ltd. Not financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
