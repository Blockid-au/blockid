"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Copy,
  Check,
  Key,
  Zap,
  Shield,
  Terminal,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Data ──────────────────────────────────────────────────────────────── */

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  credits: number;
  body?: string;
  response: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/api/svi",
    title: "Compute SVI Analysis",
    description:
      "Submit text input (startup idea, business plan, or document content) to generate a full Startup Value Index analysis with scores across 8 dimensions.",
    credits: 1,
    body: `{
  "email": "founder@example.com",
  "input": {
    "rawText": "AI-powered accounting SaaS for Australian SMEs...",
    "fileName": "business-plan.pdf"
  }
}`,
    response: `{
  "ok": true,
  "totalSVI": 72,
  "analysis": {
    "dimensions": [...],
    "summary": "...",
    "recommendations": [...]
  },
  "slug": "abc123"
}`,
  },
  {
    method: "POST",
    path: "/api/score",
    title: "Compute Investor-Ready Score",
    description:
      "Calculate an investor-readiness score based on company details, sector, and stage. No credits required.",
    credits: 0,
    body: `{
  "companyName": "Acme Pty Ltd",
  "abn": "12345678901",
  "sector": "fintech",
  "stage": "seed",
  "revenue": 50000,
  "teamSize": 4
}`,
    response: `{
  "ok": true,
  "total": 68,
  "confidence": "medium",
  "subs": [
    { "name": "Team", "score": 75 },
    { "name": "Market", "score": 62 },
    { "name": "Traction", "score": 55 },
    { "name": "Financials", "score": 70 }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/term-sheet",
    title: "Analyze Term Sheet",
    description:
      "Submit term sheet text for AI-powered analysis. Returns clause-by-clause assessment, risk flags, and negotiation suggestions.",
    credits: 3,
    body: `{
  "text": "TERM SHEET\\nCompany: Acme Pty Ltd\\nPre-money valuation: $5,000,000\\n..."
}`,
    response: `{
  "ok": true,
  "analysis": {
    "clauses": [...],
    "riskScore": 35,
    "suggestions": [...],
    "summary": "..."
  }
}`,
  },
  {
    method: "GET",
    path: "/api/credits",
    title: "Check Credit Balance",
    description:
      "Returns the current credit balance, plan information, and recent transaction history for the authenticated user.",
    credits: 0,
    response: `{
  "balance": 47.5,
  "plan": "growth",
  "transactions": [
    {
      "type": "debit",
      "amount": 1,
      "feature": "svi_analysis",
      "createdAt": "2025-05-19T10:30:00Z"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/credits/check",
    title: "Pre-flight Credit Check",
    description:
      "Check whether the authenticated user has sufficient credits for a specific feature before making the actual request.",
    credits: 0,
    body: `{
  "feature": "svi_analysis"
}`,
    response: `{
  "allowed": true,
  "balance": 47.5,
  "cost": 1
}`,
  },
];

const CURL_EXAMPLE = `curl -X POST https://blockid.au/api/svi \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "founder@example.com",
    "input": {
      "rawText": "AI-powered accounting SaaS for Australian SMEs with $50k MRR"
    }
  }'`;

const JS_EXAMPLE = `const response = await fetch("https://blockid.au/api/svi", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "founder@example.com",
    input: {
      rawText: "AI-powered accounting SaaS for Australian SMEs with $50k MRR",
    },
  }),
});

const data = await response.json();
console.log(data.totalSVI); // e.g. 72
console.log(data.analysis); // Full SVI breakdown`;

/* ─── Copy Button ───────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition-colors cursor-pointer"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check strokeWidth={1.75} className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* ─── Code Block ────────────────────────────────────────────────────────── */
function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  return (
    <div className="relative rounded-xl bg-ink-900 border border-ink-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-ink-700">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          {language}
        </span>
      </div>
      <CopyButton text={code} />
      <pre className="p-4 overflow-x-auto text-sm text-slate-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ─── Method Badge ──────────────────────────────────────────────────────── */
function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        method === "GET"
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-blue-100 text-blue-700 border border-blue-200"
      )}
    >
      {method}
    </span>
  );
}

/* ─── Main Component ────────────────────────────────────────────────────── */
export function ApiDocs() {
  const [activeTab, setActiveTab] = React.useState<"curl" | "javascript">(
    "curl"
  );

  return (
    <div className="mx-auto max-w-4xl px-6">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-4 py-1.5 mb-6">
          <Code2 strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-semibold text-brand-700">
            Developer Platform
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink-800">
          BlockID API
        </h1>
        <p className="mt-4 text-lg md:text-xl text-ink-500">
          Integrate startup intelligence into your workflow
        </p>
        <p className="mt-3 text-sm text-ink-400 max-w-lg mx-auto">
          Access SVI analysis, investor-ready scoring, term sheet analysis, and
          credit management through a simple REST API.
        </p>
      </header>

      {/* ── Authentication ───────────────────────────────────────────── */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-ink-800 mb-6 flex items-center gap-2">
          <Key strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          Authentication
        </h2>
        <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            All API requests require a Bearer token in the{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs font-mono text-brand-700">
              Authorization
            </code>{" "}
            header. API keys are available on the{" "}
            <strong>Growth plan ($499/mo)</strong> and above.
          </p>

          <CodeBlock
            language="HTTP Header"
            code='Authorization: Bearer YOUR_API_KEY'
          />

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap
                  strokeWidth={1.75}
                  className="h-4 w-4 text-brand-600"
                />
                <p className="text-sm font-semibold text-ink-800">
                  Growth Plan
                </p>
              </div>
              <p className="text-xs text-ink-500">
                100 requests/minute rate limit
              </p>
              <p className="text-xs text-ink-400 mt-1">$499/mo</p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield
                  strokeWidth={1.75}
                  className="h-4 w-4 text-ink-600"
                />
                <p className="text-sm font-semibold text-ink-800">
                  Enterprise
                </p>
              </div>
              <p className="text-xs text-ink-500">
                1,000 requests/minute rate limit
              </p>
              <p className="text-xs text-ink-400 mt-1">Custom pricing</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Endpoints ────────────────────────────────────────────────── */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-ink-800 mb-6 flex items-center gap-2">
          <Terminal strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          Endpoints
        </h2>
        <div className="space-y-6">
          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="rounded-2xl border border-surface-200 bg-white overflow-hidden"
            >
              {/* Endpoint Header */}
              <div className="px-6 py-4 border-b border-surface-100 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-1">
                    <MethodBadge method={ep.method} />
                    <code className="text-sm font-mono font-semibold text-ink-800">
                      {ep.path}
                    </code>
                  </div>
                  <h3 className="text-base font-semibold text-ink-800 mt-1">
                    {ep.title}
                  </h3>
                  <p className="text-sm text-ink-500 mt-1">
                    {ep.description}
                  </p>
                </div>
                <div className="shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                      ep.credits > 0
                        ? "bg-amber-50 border border-amber-200 text-amber-700"
                        : "bg-green-50 border border-green-200 text-green-700"
                    )}
                  >
                    <CreditCard strokeWidth={1.75} className="h-3 w-3" />
                    {ep.credits > 0
                      ? `${ep.credits} credit${ep.credits > 1 ? "s" : ""}`
                      : "Free"}
                  </span>
                </div>
              </div>

              {/* Request Body */}
              {ep.body && (
                <div className="px-6 py-4 border-b border-surface-100">
                  <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                    Request Body
                  </p>
                  <div className="relative rounded-xl bg-ink-900 border border-ink-700 overflow-hidden">
                    <CopyButton text={ep.body} />
                    <pre className="p-4 overflow-x-auto text-sm text-slate-300 leading-relaxed">
                      <code>{ep.body}</code>
                    </pre>
                  </div>
                </div>
              )}

              {/* Response */}
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  Response
                </p>
                <div className="relative rounded-xl bg-ink-900 border border-ink-700 overflow-hidden">
                  <CopyButton text={ep.response} />
                  <pre className="p-4 overflow-x-auto text-sm text-emerald-300 leading-relaxed">
                    <code>{ep.response}</code>
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Code Examples ────────────────────────────────────────────── */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-ink-800 mb-6 flex items-center gap-2">
          <Code2 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          Code Examples
        </h2>
        <p className="text-sm text-ink-500 mb-4">
          Quick-start examples for SVI analysis — the most common API call.
        </p>

        {/* Tab Switcher */}
        <div className="flex gap-1 mb-4">
          {(["curl", "javascript"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer",
                activeTab === tab
                  ? "bg-ink-900 text-white"
                  : "bg-surface-100 text-ink-600 hover:bg-surface-200"
              )}
            >
              {tab === "curl" ? "cURL" : "JavaScript"}
            </button>
          ))}
        </div>

        {activeTab === "curl" ? (
          <CodeBlock language="bash" code={CURL_EXAMPLE} />
        ) : (
          <CodeBlock language="javascript" code={JS_EXAMPLE} />
        )}
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-ink-800 mb-6 flex items-center gap-2">
          <CreditCard
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
          />
          API Pricing
        </h2>
        <div className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5">
              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-1">
                Growth Plan
              </p>
              <p className="text-2xl font-bold text-ink-800">
                $499<span className="text-sm font-normal text-ink-400">/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-brand-600"
                  />
                  API key access
                </li>
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-brand-600"
                  />
                  100 req/min rate limit
                </li>
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-brand-600"
                  />
                  Credits included with plan
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">
                Pay-Per-Use
              </p>
              <p className="text-2xl font-bold text-ink-800">
                Credit Packs
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-ink-400"
                  />
                  Purchase credit packs
                </li>
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-ink-400"
                  />
                  No monthly commitment
                </li>
                <li className="flex items-center gap-2">
                  <Check
                    strokeWidth={2}
                    className="h-3.5 w-3.5 text-ink-400"
                  />
                  Credits never expire
                </li>
              </ul>
            </div>
          </div>

          {/* Credit Costs */}
          <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-500 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-ink-500 uppercase tracking-wider">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {ENDPOINTS.map((ep) => (
                  <tr key={ep.path}>
                    <td className="px-5 py-2.5">
                      <code className="text-xs font-mono text-ink-700">
                        {ep.method} {ep.path}
                      </code>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          ep.credits > 0 ? "text-amber-700" : "text-green-600"
                        )}
                      >
                        {ep.credits > 0 ? ep.credits : "Free"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="mt-16 text-center">
        <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-b from-brand-50/60 to-white p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold text-ink-800">
            Ready to integrate?
          </h2>
          <p className="mt-3 text-base text-ink-500 max-w-md mx-auto">
            Get API access with the Growth plan or purchase credit packs for
            pay-per-use access.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center gap-2.5 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow"
            >
              Get API Access{" "}
              <ArrowRight strokeWidth={2} className="h-5 w-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center gap-2.5 rounded-2xl border border-surface-300 bg-white px-8 text-base font-semibold text-ink-700 hover:bg-surface-100 transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
