"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileText,
  Menu,
  Mic,
  MicOff,
  Search,
  UploadCloud,
  X,
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

// ─── Navigation items ────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
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

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // ── Voice input ──────────────────────────────────────────────────────────
  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = typeof window !== "undefined" ? (window as any) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec: (new () => any) | undefined =
      w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Voice input is not supported in your browser. Try Chrome or Edge.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-AU";
    let finalTranscript = text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t + " ";
        else interim = t;
      }
      setText(finalTranscript + interim);
    };
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  };

  // ── File handling ────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    const rawText = file ? `File: ${file.name}\n${text}` : text;
    if (!rawText.trim() && !file) {
      setError("Please describe your idea or upload a document.");
      return;
    }
    setError("");
    setState("submitting");
    try {
      const res = await fetch("/api/svi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          input: {
            rawText: rawText.trim() || `Business plan document: ${file?.name}`,
            fileName: file?.name,
          },
        }),
      });
      const data = (await res.json()) as SVIApiResponse;
      if (!data.ok) {
        setError("Analysis failed. Please try again.");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  const handleReset = () => {
    setResult(null);
    setState("idle");
    setText("");
    setFile(null);
    setEmail("");
    setError("");
  };

  // ── Results view ─────────────────────────────────────────────────────────
  if (state === "done" && result) {
    return (
      <div className="min-h-svh bg-ink-950 flex flex-col">
        <header className="px-6 py-5 flex items-center justify-between max-w-2xl mx-auto w-full">
          <Link href="/" className="inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-dark.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight text-slate-50">
              BlockID<span className="text-brand-400">.au</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer transition-colors flex items-center gap-1.5"
          >
            <X strokeWidth={1.75} className="h-3.5 w-3.5" />
            New analysis
          </button>
        </header>
        <main className="flex-1 px-4 pb-12">
          <SVIResultsPanel
            analysis={result.analysis}
            slug={result.slug}
            onReset={handleReset}
            rawText={text}
          />
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Google-style entrance
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="min-h-svh bg-white flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* ── Top bar (Google-style) ─────────────────────────────────────────── */}
      <TopBar />

      {/* ── Center content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
        <div className="w-full max-w-[584px] flex flex-col items-center">
          {/* Logo — large, centered */}
          <div className="flex flex-col items-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo.svg"
              alt="BlockID.au"
              className="h-24 w-24 md:h-28 md:w-28 mb-4"
            />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
              <span className="text-[#1B3A6B]">BlockID</span>
              <span className="text-[#2B6FD4]">.au</span>
            </h1>
            <p className="mt-2 text-sm text-slate-500 tracking-[0.08em] font-medium">
              Valuation. Ownership. Growth.
            </p>
          </div>

          {/* Search bar — Google-style pill */}
          <form onSubmit={handleSubmit} className="w-full">
            <div
              className={cn(
                "w-full rounded-full border transition-all duration-200",
                searchFocused || text
                  ? "border-transparent shadow-[0_1px_6px_rgba(32,33,36,0.28)] rounded-3xl"
                  : "border-slate-200 hover:shadow-[0_1px_6px_rgba(32,33,36,0.20)]",
              )}
            >
              {/* Search input row */}
              <div className="flex items-center px-4 py-3 gap-3">
                <Search
                  strokeWidth={1.75}
                  className="h-5 w-5 text-slate-400 shrink-0"
                />
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Describe your startup idea, business plan, or paste key details…"
                  rows={1}
                  className="flex-1 resize-none text-base text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {/* Voice button */}
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "shrink-0 h-9 w-9 flex items-center justify-center rounded-full cursor-pointer transition-colors",
                    listening
                      ? "bg-red-50 text-red-500 hover:bg-red-100"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {listening ? (
                    <MicOff strokeWidth={1.75} className="h-5 w-5" />
                  ) : (
                    <Mic strokeWidth={1.75} className="h-5 w-5" />
                  )}
                </button>
                {/* Upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Upload document"
                  className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <UploadCloud strokeWidth={1.75} className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </div>

              {/* File chip */}
              {file && (
                <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                  <FileText strokeWidth={1.75} className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="text-xs font-medium text-brand-700 truncate">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-auto shrink-0 text-brand-400 hover:text-brand-700 cursor-pointer"
                  >
                    <X strokeWidth={1.75} className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Listening indicator */}
              {listening && (
                <div className="px-5 pb-3">
                  <span className="text-xs text-red-500 animate-pulse font-medium">
                    Listening…
                  </span>
                </div>
              )}
            </div>

            {/* Email row — appears when user starts typing */}
            {(text.trim() || file) && (
              <div className="mt-3 flex items-center justify-center gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="h-10 w-56 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="mt-2 text-center text-sm text-red-500">{error}</p>
            )}

            {/* Action buttons — Google-style */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="h-9 px-4 rounded-lg bg-[#f8f9fa] border border-[#f8f9fa] text-sm font-medium text-slate-700 hover:border-slate-300 hover:shadow-[0_1px_1px_rgba(0,0,0,0.1)] active:border-slate-300 cursor-pointer transition-all disabled:opacity-50"
              >
                {state === "submitting" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                    Analyzing…
                  </span>
                ) : (
                  "Get My SVI"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  const ex = QUICK_EXAMPLES[Math.floor(Math.random() * QUICK_EXAMPLES.length)];
                  setText(ex);
                  textareaRef.current?.focus();
                }}
                className="h-9 px-4 rounded-lg bg-[#f8f9fa] border border-[#f8f9fa] text-sm font-medium text-slate-700 hover:border-slate-300 hover:shadow-[0_1px_1px_rgba(0,0,0,0.1)] active:border-slate-300 cursor-pointer transition-all"
              >
                Try an Example
              </button>
            </div>

            {/* Hint */}
            <p className="mt-4 text-center text-xs text-slate-400">
              Free · No credit card · Drag &amp; drop a PDF · Voice input supported
            </p>
          </form>

          {/* Quick suggestion chips */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {QUICK_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-brand-300 hover:text-brand-700 cursor-pointer transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* Founding 50 strip */}
          <div className="mt-8 w-full rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-slate-800">
                Founding 50 — AUD $49
                <span className="ml-2 text-[10px] uppercase tracking-wider font-medium text-slate-400 line-through">
                  $99
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Lifetime SVI account · Cap table · Evidence Vault · Export packs
              </p>
            </div>
            <Link
              href="/founding-50"
              className="shrink-0 inline-flex h-9 items-center gap-2 rounded-lg bg-[#1B3A6B] px-4 text-sm font-semibold text-white hover:bg-[#152d55] transition-colors cursor-pointer"
            >
              Claim your spot →
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer (Google-style) ──────────────────────────────────────────── */}
      <BottomFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Top bar — Google-style minimal navigation
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar() {
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const toolsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [toolsOpen]);

  return (
    <header className="flex items-center justify-end gap-1 px-4 py-3 text-sm">
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {/* Tools dropdown */}
        <div ref={toolsRef} className="relative">
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:underline cursor-pointer rounded transition-colors"
          >
            Tools
            <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 opacity-60" />
          </button>
          {toolsOpen && (
            <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 z-50">
              {TOOLS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={() => setToolsOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link
          href="/founding-50"
          className="px-3 py-2 text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          Founding 50
        </Link>
        <Link
          href="/dashboard/svi"
          className="px-3 py-2 text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          Dashboard
        </Link>
        <Link
          href="/auth/login"
          className="ml-2 h-9 px-5 inline-flex items-center justify-center rounded-lg bg-[#1a73e8] text-sm font-medium text-white hover:bg-[#1765cc] hover:shadow-md transition-all cursor-pointer"
        >
          Sign in
        </Link>
      </nav>

      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="md:hidden h-10 w-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
      >
        {mobileOpen ? (
          <X strokeWidth={1.75} className="h-5 w-5" />
        ) : (
          <Menu strokeWidth={1.75} className="h-5 w-5" />
        )}
      </button>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <Link href="/" className="inline-flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.svg" alt="" className="h-8 w-8" />
              <span className="text-lg font-bold tracking-tight text-[#1B3A6B]">
                BlockID<span className="text-[#2B6FD4]">.au</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>
          <nav className="px-4 py-4 flex flex-col gap-1">
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
              Free Tools
            </p>
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                {t.label}
              </Link>
            ))}
            <div className="my-2 border-t border-slate-100" />
            <Link
              href="/founding-50"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Founding 50
            </Link>
            <Link
              href="/dashboard/svi"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Dashboard
            </Link>
            <div className="my-2 border-t border-slate-100" />
            <Link
              href="/auth/login"
              onClick={() => setMobileOpen(false)}
              className="mx-3 h-10 flex items-center justify-center rounded-lg bg-[#1a73e8] text-sm font-medium text-white hover:bg-[#1765cc] transition-colors"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bottom footer — Google-style
// ═══════════════════════════════════════════════════════════════════════════════
function BottomFooter() {
  return (
    <footer className="bg-[#f2f2f2] text-sm text-slate-600">
      {/* Country bar */}
      <div className="border-b border-slate-300 px-6 py-3">
        <p className="max-w-[584px] mx-auto">Australia</p>
      </div>
      {/* Links */}
      <div className="px-6 py-3">
        <div className="max-w-[584px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href="#" className="hover:underline">About</Link>
            <Link href="#" className="hover:underline">Privacy</Link>
            <Link href="#" className="hover:underline">Terms</Link>
            <Link href="#" className="hover:underline">Contact</Link>
          </div>
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} BlockID Pty Ltd
          </p>
        </div>
      </div>
    </footer>
  );
}
