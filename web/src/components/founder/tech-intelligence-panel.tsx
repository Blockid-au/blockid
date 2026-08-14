"use client";

// TechIntelligencePanel — Website + GitHub scoring with SVI/valuation boost.
//
// Displays:
//   • URL input form (website required, GitHub optional)
//   • Real-time step indicator while crawling
//   • Tech Score badge (0-100, colored)
//   • 4 sub-score progress bars
//   • SVI Contribution + Valuation Boost chips
//   • Website signals chips
//   • GitHub signals (if provided)
//   • LLM summary + strengths/gaps
//
// Supports EN + VI copy.

import { useState } from "react";
import type { TechIntelligenceResult } from "@/lib/agents/tech-intelligence";

// ── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  en: {
    title: "Tech Intelligence",
    subtitle: "Analyse your website and GitHub repo to unlock a Tech Score that boosts your SVI.",
    websiteLabel: "Website URL",
    websitePlaceholder: "https://yoursite.com",
    githubLabel: "GitHub URL (optional)",
    githubPlaceholder: "https://github.com/your-org/your-repo",
    analyseButton: "Analyse Tech Stack",
    loadingSteps: ["Crawling website...", "Fetching GitHub...", "Running AI assessment..."],
    techScore: "Tech Score",
    sviContribution: "SVI Contribution",
    valuationBoost: "Valuation Boost",
    subScores: {
      techMaturity: "Tech Maturity",
      productPresence: "Product Presence",
      developerActivity: "Dev Activity",
      scalabilityScore: "Scalability",
    },
    websiteSignals: "Website Signals",
    githubSignals: "GitHub Signals",
    aiSummary: "AI Assessment",
    strengths: "Strengths",
    gaps: "Gaps & Risks",
    noGitHub: "No GitHub repository analysed.",
    errorGeneric: "Analysis failed — please try again.",
    errorRateLimit: "Rate limit reached — up to 5 analyses per hour.",
    errorAuth: "Please sign in to use Tech Intelligence.",
    lastCommit: "last commit",
    daysAgo: "days ago",
    stars: "stars",
    license: "License",
    language: "Language",
    noLicense: "No license",
    inactive: "inactive",
  },
  vi: {
    title: "Tech Intelligence",
    subtitle: "Phân tích website và GitHub repo để nhận Tech Score, tăng điểm SVI của bạn.",
    websiteLabel: "URL Website",
    websitePlaceholder: "https://yoursite.com",
    githubLabel: "URL GitHub (tùy chọn)",
    githubPlaceholder: "https://github.com/your-org/your-repo",
    analyseButton: "Phân Tích Tech Stack",
    loadingSteps: ["Đang quét website...", "Đang lấy dữ liệu GitHub...", "Đang chạy AI..."],
    techScore: "Tech Score",
    sviContribution: "Đóng Góp SVI",
    valuationBoost: "Tăng Định Giá",
    subScores: {
      techMaturity: "Độ Trưởng Thành Công Nghệ",
      productPresence: "Sự Hiện Diện Sản Phẩm",
      developerActivity: "Hoạt Động Dev",
      scalabilityScore: "Khả Năng Mở Rộng",
    },
    websiteSignals: "Tín Hiệu Website",
    githubSignals: "Tín Hiệu GitHub",
    aiSummary: "Đánh Giá AI",
    strengths: "Điểm Mạnh",
    gaps: "Rủi Ro & Khoảng Trống",
    noGitHub: "Chưa phân tích GitHub repository.",
    errorGeneric: "Phân tích thất bại — vui lòng thử lại.",
    errorRateLimit: "Đã đạt giới hạn — tối đa 5 lần mỗi giờ.",
    errorAuth: "Vui lòng đăng nhập để sử dụng Tech Intelligence.",
    lastCommit: "commit gần nhất",
    daysAgo: "ngày trước",
    stars: "sao",
    license: "Giấy phép",
    language: "Ngôn ngữ",
    noLicense: "Không có giấy phép",
    inactive: "không hoạt động",
  },
} as const;

type Locale = keyof typeof COPY;
type Copy = (typeof COPY)[Locale];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-500 text-white";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function scoreRingColor(score: number): string {
  if (score >= 70) return "border-green-500";
  if (score >= 40) return "border-amber-500";
  return "border-red-500";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Developing";
  return "Early";
}

function progressBarColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-400";
}

interface SubScoreBarProps {
  label: string;
  value: number;
}

function SubScoreBar({ label, value }: SubScoreBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

interface SignalChipProps {
  label: string;
  active: boolean;
}

function SignalChip({ label, active }: SignalChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        active
          ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700"
          : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 line-through"
      }`}
    >
      {active ? "✓" : "✗"} {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TechIntelligencePanelProps {
  startupId: string;
  initialWebsiteUrl?: string;
  initialGithubUrl?: string;
  locale?: Locale;
  className?: string;
}

type Status = "idle" | "loading" | "success" | "error";

export function TechIntelligencePanel({
  startupId,
  initialWebsiteUrl = "",
  initialGithubUrl = "",
  locale = "en",
  className = "",
}: TechIntelligencePanelProps) {
  const c: Copy = COPY[locale];

  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [githubUrl, setGithubUrl] = useState(initialGithubUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TechIntelligenceResult | null>(null);

  async function handleAnalyse() {
    if (!websiteUrl.trim()) return;
    setStatus("loading");
    setError(null);
    setLoadingStep(0);

    // Cycle loading messages
    const stepTimer = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, c.loadingSteps.length - 1));
    }, 2500);

    try {
      const res = await fetch("/api/founder/tech-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startup_id: startupId,
          website_url: websiteUrl.trim(),
          github_url: githubUrl.trim() || null,
        }),
      });

      const data = await res.json() as TechIntelligenceResult & { ok: boolean; reason?: string };

      if (!res.ok || !data.ok) {
        const reason = data.reason ?? "";
        if (res.status === 429 || reason === "rate_limited") {
          setError(c.errorRateLimit);
        } else if (res.status === 401 || reason === "authentication_required") {
          setError(c.errorAuth);
        } else {
          setError(c.errorGeneric);
        }
        setStatus("error");
        return;
      }

      setResult(data);
      setStatus("success");
    } catch {
      setError(c.errorGeneric);
      setStatus("error");
    } finally {
      clearInterval(stepTimer);
    }
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{c.title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{c.subtitle}</p>
      </div>

      {/* Input form */}
      <div className="space-y-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {c.websiteLabel}
          </label>
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder={c.websitePlaceholder}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={status === "loading"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {c.githubLabel}
          </label>
          <input
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder={c.githubPlaceholder}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={status === "loading"}
          />
        </div>
        <button
          onClick={handleAnalyse}
          disabled={status === "loading" || !websiteUrl.trim()}
          className="w-full py-2 px-4 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading" ? c.loadingSteps[loadingStep] : c.analyseButton}
        </button>
        {status === "error" && error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {/* Results */}
      {status === "success" && result && (
        <div className="space-y-4">
          {/* Tech Score badge + contribution chips */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Big score badge */}
            <div
              className={`flex flex-col items-center justify-center w-24 h-24 rounded-2xl border-4 ${scoreRingColor(result.techScore)}`}
            >
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {result.techScore}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${scoreColor(result.techScore)}`}>
                {scoreLabel(result.techScore)}
              </span>
            </div>
            <div className="space-y-2">
              <span className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                {c.sviContribution}: +{result.sviContribution} pts
              </span>
              <br />
              {result.valuationMultiplierBoost > 0 && (
                <span className="inline-block bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700 text-xs font-semibold px-3 py-1 rounded-full">
                  {c.valuationBoost}: +{result.valuationMultiplierBoost}%
                </span>
              )}
            </div>
          </div>

          {/* Sub-scores */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <SubScoreBar label={c.subScores.techMaturity} value={result.llmAssessment.techMaturity} />
            <SubScoreBar label={c.subScores.productPresence} value={result.llmAssessment.productPresence} />
            <SubScoreBar label={c.subScores.developerActivity} value={result.llmAssessment.developerActivity} />
            <SubScoreBar label={c.subScores.scalabilityScore} value={result.llmAssessment.scalabilityScore} />
          </div>

          {/* Website signal chips */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {c.websiteSignals}
            </h3>
            <div className="flex flex-wrap gap-2">
              <SignalChip label="SSL" active={result.websiteSignals.hasSSL} />
              <SignalChip label="Analytics" active={result.websiteSignals.hasAnalytics} />
              <SignalChip label="Pricing page" active={result.websiteSignals.hasPricing} />
              <SignalChip label="Contact" active={result.websiteSignals.hasContact} />
              <SignalChip label="Meta tags" active={result.websiteSignals.hasMeta} />
            </div>
            {result.websiteSignals.techStack.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.websiteSignals.techStack.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium border border-gray-200 dark:border-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* GitHub signals */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {c.githubSignals}
            </h3>
            {result.githubSignals ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <SignalChip label="Tests" active={result.githubSignals.hasTests} />
                  <SignalChip label="CI/CD" active={result.githubSignals.hasCI} />
                  <SignalChip label="README" active={result.githubSignals.hasReadme} />
                  <SignalChip
                    label={result.githubSignals.license ?? c.noLicense}
                    active={!!result.githubSignals.license}
                  />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <span>⭐ {result.githubSignals.stars} {c.stars}</span>
                  <span>
                    {c.lastCommit}:{" "}
                    <span
                      className={
                        result.githubSignals.commitFrequency === "inactive"
                          ? "text-red-500"
                          : "text-green-600 dark:text-green-400"
                      }
                    >
                      {result.githubSignals.lastCommitDays} {c.daysAgo} ({result.githubSignals.commitFrequency})
                    </span>
                  </span>
                </div>
                {result.githubSignals.languages.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {result.githubSignals.languages.slice(0, 6).map((lang) => (
                      <span
                        key={lang}
                        className="px-2 py-0.5 text-xs rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 font-medium"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">{c.noGitHub}</p>
            )}
          </div>

          {/* AI Assessment */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {c.aiSummary}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {result.llmAssessment.summary}
            </p>
            {result.llmAssessment.strengths.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">{c.strengths}</p>
                <ul className="space-y-1">
                  {result.llmAssessment.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-2">
                      <span className="text-green-500 shrink-0">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.llmAssessment.gaps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">{c.gaps}</p>
                <ul className="space-y-1">
                  {result.llmAssessment.gaps.map((g, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-2">
                      <span className="text-amber-500 shrink-0">•</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
