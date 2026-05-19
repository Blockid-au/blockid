"use client";

import * as React from "react";
import { FileText, Mic, MicOff, Send, UploadCloud, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SVIResultsPanel } from "@/components/svi/svi-results-panel";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type InputMode = "text" | "file";
type SubmitState = "idle" | "submitting" | "done" | "error";

interface SVIApiResponse {
  ok: boolean;
  slug: string;
  totalSVI: number;
  analysis: SVIAnalysis;
  persisted: boolean;
}

export function SVIEntrance() {
  const [mode, setMode] = React.useState<InputMode>("text");
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [email, setEmail] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [state, setState] = React.useState<SubmitState>("idle");
  const [result, setResult] = React.useState<SVIApiResponse | null>(null);
  const [error, setError] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  // ── Voice input ──────────────────────────────────────────────────────────
  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = typeof window !== "undefined" ? (window as any) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec: (new () => any) | undefined = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;

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
    setMode("text");
  };

  // ── File drop ────────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setMode("file"); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setMode("file"); }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    const rawText = mode === "file" && file
      ? `File: ${file.name}\n${text}`
      : text;

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
      const data = await res.json() as SVIApiResponse;
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
          <Logo variant="dark" />
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

  // ── Entrance view ─────────────────────────────────────────────────────────
  return (
    <div
      id="svi"
      className="min-h-svh bg-white flex flex-col items-center justify-center px-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-2xl flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <Logo variant="light" className="scale-125" />
          <p className="text-sm text-slate-500 font-medium tracking-wide">
            Startup Value Index — measure, prove and grow startup value from day one
          </p>
        </div>

        {/* Input card */}
        <form onSubmit={handleSubmit} className="w-full">
          <div
            className={cn(
              "w-full rounded-2xl border shadow-sm transition-shadow duration-200",
              "border-slate-200 bg-white hover:shadow-md focus-within:shadow-md",
              "focus-within:border-brand-300",
            )}
          >
            {/* Mode tabs */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-1">
              <button
                type="button"
                onClick={() => setMode("text")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                  mode === "text"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-400 hover:text-slate-600",
                )}
              >
                <Send strokeWidth={1.75} className="h-3.5 w-3.5" />
                Idea / Plan
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                  mode === "file"
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-400 hover:text-slate-600",
                )}
              >
                <UploadCloud strokeWidth={1.75} className="h-3.5 w-3.5" />
                Upload doc
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
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                <FileText strokeWidth={1.75} className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="text-xs font-medium text-brand-700 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => { setFile(null); if (mode === "file") setMode("text"); }}
                  className="ml-auto shrink-0 text-brand-400 hover:text-brand-700 cursor-pointer"
                >
                  <X strokeWidth={1.75} className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                file
                  ? "Add context about your idea or paste key details here (optional)…"
                  : "Describe your idea or business plan. Include your market, product, traction, revenue, team, and cap table if you have them…"
              }
              rows={4}
              className={cn(
                "w-full resize-none px-4 pt-2 pb-3 text-sm text-slate-800 placeholder:text-slate-400",
                "focus:outline-none bg-transparent leading-relaxed",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />

            {/* Bottom bar */}
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <div className="flex items-center gap-2">
                {/* Voice */}
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={listening ? "Stop voice input" : "Start voice input"}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors",
                    listening
                      ? "bg-red-100 text-red-600 hover:bg-red-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                  )}
                >
                  {listening ? (
                    <MicOff strokeWidth={1.75} className="h-4 w-4" />
                  ) : (
                    <Mic strokeWidth={1.75} className="h-4 w-4" />
                  )}
                </button>
                {listening && (
                  <span className="text-xs text-red-500 animate-pulse font-medium">
                    Listening…
                  </span>
                )}
              </div>

              {/* Email + submit */}
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className={cn(
                    "h-9 w-48 rounded-[10px] border border-slate-200 bg-white px-3 text-sm",
                    "text-slate-800 placeholder:text-slate-400",
                    "focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200",
                    "transition-colors",
                  )}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={state === "submitting"}
                  className="h-9 px-4 text-sm"
                >
                  {state === "submitting" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Analyzing…
                    </span>
                  ) : (
                    "Get My SVI"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="mt-2 text-center text-sm text-red-500">{error}</p>
          )}

          {/* Hint */}
          <p className="mt-3 text-center text-xs text-slate-400">
            Free · No credit card · Cmd+Enter to submit · Drag & drop a PDF or Word doc
          </p>
        </form>

        {/* Founding 50 strip */}
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-800">
              Founding 50 — AUD $49
              <span className="ml-2 text-[10px] uppercase tracking-wider font-medium text-slate-400 line-through">$99</span>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Lifetime SVI account · Cap table · Evidence Vault · Export packs · 30-day growth plan
            </p>
          </div>
          <a
            href="/founding-50"
            className="shrink-0 inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 transition-colors cursor-pointer cta-glow"
          >
            Claim your spot →
          </a>
        </div>

        {/* Quick examples */}
        <div className="flex flex-wrap justify-center gap-2">
          {[
            "AI SaaS for accountants in Australia",
            "Two-sided marketplace for tradies",
            "B2B fintech replacing bank guarantees",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setText(ex); setMode("text"); textareaRef.current?.focus(); }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:border-brand-300 hover:text-brand-700 cursor-pointer transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Idea Estimate Section */}
        <IdeaEstimateSection />
      </div>
    </div>
  );
}

function IdeaEstimateSection() {
  const [text, setText] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = React.useState<{
    lowAud: number; highAud: number; strengths: string[]; gaps: string[]; nextStep: string;
  } | null>(null);

  const fmt = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !email.includes("@")) return;
    setState("loading");
    try {
      const res = await fetch("/api/idea-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, email }),
      });
      const data = await res.json() as { ok: boolean; lowAud?: number; highAud?: number; strengths?: string[]; gaps?: string[]; nextStep?: string };
      if (data.ok) {
        setResult({ lowAud: data.lowAud ?? 0, highAud: data.highAud ?? 0, strengths: data.strengths ?? [], gaps: data.gaps ?? [], nextStep: data.nextStep ?? "" });
        setState("done");
      } else setState("error");
    } catch { setState("error"); }
  };

  return (
    <div className="w-full border-t border-slate-100 pt-8 mt-2">
      <div className="text-center mb-5">
        <p className="text-base font-semibold text-slate-700">💡 Ý tưởng của bạn đáng giá bao nhiêu?</p>
        <p className="text-xs text-slate-400 mt-1">Nhập mô tả ý tưởng để nhận ước lượng giá trị ban đầu — miễn phí · Free idea value estimate</p>
      </div>

      {state !== "done" ? (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Mô tả ý tưởng của bạn bằng 1-2 câu… / Describe your idea in 1-2 sentences…"
            rows={3}
            className="w-full resize-none px-4 pt-4 pb-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent leading-relaxed rounded-t-2xl"
          />
          <div className="flex items-center gap-2 px-4 pb-4 border-t border-slate-100 pt-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@startup.com"
              required
              className="flex-1 h-9 rounded-[10px] border border-slate-200 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={state === "loading" || !text.trim()}
              className="h-9 px-4 rounded-[10px] bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-colors disabled:opacity-50 shrink-0"
            >
              {state === "loading" ? (
                <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Đang tính…</span>
              ) : "Ước tính ngay →"}
            </button>
          </div>
        </form>
      ) : result ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5 space-y-4">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400 font-medium mb-1">Estimated Idea Value</p>
            <p className="font-mono text-3xl font-bold text-slate-800">{fmt(result.lowAud)} <span className="text-slate-400">–</span> {fmt(result.highAud)}</p>
            <p className="text-xs text-slate-400 mt-1">AUD · Pre-revenue idea-stage range · Not a legal valuation</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {result.strengths.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-green-600 font-medium mb-1.5">Điểm mạnh / Strengths</p>
                <ul className="space-y-1">{result.strengths.map(s => <li key={s} className="text-xs text-slate-500 flex items-start gap-1"><span className="text-green-500 shrink-0">✓</span>{s}</li>)}</ul>
              </div>
            )}
            {result.gaps.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-amber-600 font-medium mb-1.5">Cần cải thiện / Gaps</p>
                <ul className="space-y-1">{result.gaps.map(g => <li key={g} className="text-xs text-slate-500 flex items-start gap-1"><span className="text-amber-500 shrink-0">!</span>{g}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 leading-relaxed"><span className="font-semibold text-slate-700">Bước tiếp theo:</span> {result.nextStep}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setState("idle"); setResult(null); setText(""); }} className="flex-1 h-9 rounded-[10px] border border-slate-200 text-sm text-slate-500 hover:text-slate-700 transition-colors">Thử lại</button>
            <a href="#svi" className="flex-1 h-9 rounded-[10px] bg-brand-700 text-white text-sm font-semibold flex items-center justify-center hover:bg-brand-800 transition-colors">Get Full SVI →</a>
          </div>
        </div>
      ) : null}

      {state === "error" && <p className="text-center text-xs text-red-500 mt-2">Có lỗi xảy ra. Vui lòng thử lại. / Something went wrong.</p>}
    </div>
  );
}
