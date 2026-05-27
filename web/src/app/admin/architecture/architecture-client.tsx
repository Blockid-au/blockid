"use client";

import * as React from "react";
import {
  Activity,
  ArrowRight,
  Box,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Cloud,
  Cpu,
  Database,
  Globe,
  Layers,
  Lock,
  Monitor,
  Network,
  Route,
  Server,
  Shield,
  Timer,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/admin-layout";

/* ── Types ──────────────────────────────────────────────────────────────── */

type ServiceStatus = "live" | "building" | "planned";

interface MicroService {
  name: string;
  port: string;
  runtime: string;
  status: ServiceStatus;
  description: string;
}

interface AIProvider {
  name: string;
  tier: string;
  tierLabel: string;
  models: string;
  modelCount: number;
  costPer1k: string;
  status: "active" | "inactive";
}

interface DBTableGroup {
  domain: string;
  color: string;
  bgColor: string;
  tables: string[];
}

interface APIRouteGroup {
  domain: string;
  count: number;
  color: string;
}

interface CronJob {
  schedule: string;
  name: string;
  description: string;
  endpoint: string;
}

/* ── Static Data ───────────────────────────────────────────────────────── */

const MICROSERVICES: MicroService[] = [
  {
    name: "Next.js Monolith",
    port: ":4001",
    runtime: "Next.js 15 + React 19",
    status: "live",
    description: "Main application — frontend, API routes, SSR, cron jobs",
  },
  {
    name: "AI Gateway",
    port: ":4010",
    runtime: "Fastify",
    status: "live",
    description: "Unified AI provider routing with fallback chain + budget tracking",
  },
  {
    name: "Billing Service",
    port: ":4011",
    runtime: "Fastify",
    status: "live",
    description: "Stripe integration, credit system, checkout, webhooks",
  },
  {
    name: "Auth Service",
    port: ":4012",
    runtime: "Fastify",
    status: "building",
    description: "Standalone auth — magic link, Google OAuth, session management",
  },
  {
    name: "SVI Engine",
    port: ":4013",
    runtime: "Fastify",
    status: "building",
    description: "Dedicated SVI analysis — scoring, report generation, evidence",
  },
  {
    name: "Redis",
    port: ":6379",
    runtime: "Redis 7",
    status: "live",
    description: "Cache layer + queue for AI requests and rate limiting",
  },
  {
    name: "Ollama",
    port: ":11434",
    runtime: "Ollama",
    status: "live",
    description: "Local LLM fallback — qwen2.5:3b for zero-cost inference",
  },
];

const AI_PROVIDERS: AIProvider[] = [
  { name: "OpenRouter", tier: "1", tierLabel: "Free", models: "gemma-3, llama-4, deepseek-r1, phi-4, qwen3, mistral-small, command-a, etc.", modelCount: 10, costPer1k: "$0.00", status: "active" },
  { name: "Gemini", tier: "1", tierLabel: "Free", models: "gemini-2.0-flash, gemini-2.5-flash", modelCount: 2, costPer1k: "$0.00", status: "active" },
  { name: "Groq", tier: "1", tierLabel: "Free", models: "llama-3.3-70b, gemma2-9b", modelCount: 2, costPer1k: "$0.00", status: "active" },
  { name: "Claude OAuth", tier: "2", tierLabel: "Sub", models: "claude-sonnet-4-5, claude-haiku-4-5", modelCount: 2, costPer1k: "$0.00*", status: "active" },
  { name: "Codex", tier: "2", tierLabel: "Sub", models: "codex-mini", modelCount: 1, costPer1k: "$0.00*", status: "active" },
  { name: "Proxy", tier: "2", tierLabel: "Sub", models: "various", modelCount: 1, costPer1k: "$0.00*", status: "inactive" },
  { name: "Anthropic API", tier: "3", tierLabel: "Paid", models: "claude-sonnet-4-5, claude-haiku-4-5", modelCount: 2, costPer1k: "$0.003", status: "active" },
  { name: "OpenAI API", tier: "3", tierLabel: "Paid", models: "gpt-4o-mini", modelCount: 1, costPer1k: "$0.002", status: "active" },
  { name: "Ollama (local)", tier: "4", tierLabel: "Local", models: "qwen2.5:3b", modelCount: 1, costPer1k: "$0.00", status: "active" },
];

const DB_TABLE_GROUPS: DBTableGroup[] = [
  {
    domain: "Auth",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    tables: ["app_users", "sessions", "api_keys", "oauth_tokens", "login_attempts"],
  },
  {
    domain: "SVI",
    color: "text-brand-600",
    bgColor: "bg-brand-50",
    tables: [
      "svi_analyses", "svi_accounts", "svi_evidence", "svi_scores",
      "svi_dimensions", "report_sections", "report_bundles",
      "svi_share_links", "svi_notifications", "svi_projects",
    ],
  },
  {
    domain: "Equity",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    tables: [
      "shareholders", "share_classes", "vesting_schedules",
      "vesting_milestones", "esop_pools", "cap_table_snapshots",
      "equity_transactions", "term_sheets",
    ],
  },
  {
    domain: "Billing",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    tables: [
      "credit_balances", "credit_transactions", "subscriptions",
      "coupons", "coupon_redemptions", "stripe_customers",
      "invoices", "credit_packs",
    ],
  },
  {
    domain: "Blockchain",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    tables: [
      "blockchain_sync_config", "blockchain_sync_queue",
      "token_metadata", "wallet_connections", "on_chain_events",
    ],
  },
  {
    domain: "Platform",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    tables: [
      "growth_insights", "rnd_reports", "competitor_analyses",
      "feature_flags", "cron_logs", "system_config",
      "page_views", "event_tracking",
    ],
  },
];

const API_ROUTE_GROUPS: APIRouteGroup[] = [
  { domain: "Auth", count: 9, color: "bg-purple-500" },
  { domain: "SVI Analysis", count: 23, color: "bg-brand-500" },
  { domain: "Equity & Vesting", count: 15, color: "bg-teal-500" },
  { domain: "Billing & Credits", count: 12, color: "bg-emerald-500" },
  { domain: "Reports", count: 18, color: "bg-blue-500" },
  { domain: "Admin", count: 14, color: "bg-red-500" },
  { domain: "Blockchain", count: 8, color: "bg-amber-500" },
  { domain: "Cron", count: 12, color: "bg-rose-500" },
  { domain: "Growth & R&D", count: 11, color: "bg-indigo-500" },
  { domain: "Public API (v1)", count: 7, color: "bg-cyan-500" },
  { domain: "Webhooks", count: 5, color: "bg-orange-500" },
  { domain: "Upload & Media", count: 9, color: "bg-pink-500" },
];

const CRON_JOBS: CronJob[] = [
  { schedule: "0 22 * * *", name: "Daily Admin Report", description: "Sends admin dashboard email with signups, revenue, AI usage", endpoint: "/api/cron/daily-admin-report" },
  { schedule: "0 22 * * *", name: "Growth Intelligence", description: "AI agent analyzes user behavior, funnel metrics, proposes experiments", endpoint: "/api/cron/growth-intelligence" },
  { schedule: "0 22 * * *", name: "SVI Snapshot", description: "Captures daily SVI scores for trend tracking", endpoint: "/api/cron/svi-snapshot" },
  { schedule: "0 1 * * *", name: "Weekly Summary Email", description: "Sends weekly SVI report to active users (Mon 11am AEST)", endpoint: "/api/cron/weekly-email" },
  { schedule: "0 */6 * * *", name: "Credit Balance Check", description: "Alerts users with low credit balance", endpoint: "/api/cron/credit-check" },
  { schedule: "0 3 * * *", name: "Competitor Scan", description: "R&D agent scans competitor changes", endpoint: "/api/cron/competitor-scan" },
  { schedule: "0 4 * * *", name: "SEO Health Check", description: "Checks sitemap, indexing, broken links", endpoint: "/api/cron/seo-check" },
  { schedule: "*/30 * * * *", name: "Health Ping", description: "Container health check + uptime tracking", endpoint: "/api/cron/health" },
  { schedule: "0 5 * * 1", name: "Blockchain Sync", description: "Syncs on-chain equity token state", endpoint: "/api/cron/blockchain-sync" },
  { schedule: "0 2 * * *", name: "Cache Warmup", description: "Warms Redis cache for popular queries", endpoint: "/api/cron/cache-warmup" },
  { schedule: "0 6 1 * *", name: "Monthly Revenue Report", description: "Calculates MRR, churn, LTV for CFO dashboard", endpoint: "/api/cron/monthly-report" },
  { schedule: "0 0 * * *", name: "Token Cleanup", description: "Expires stale sessions, rotates temp tokens", endpoint: "/api/cron/token-cleanup" },
];

/* ── Status Badge ──────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: ServiceStatus | "active" | "inactive" }) {
  const config = {
    live: { label: "Live", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
    active: { label: "Active", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
    building: { label: "Building", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
    planned: { label: "Planned", bg: "bg-surface-200", text: "text-ink-500", dot: "bg-surface-400" },
    inactive: { label: "Inactive", bg: "bg-surface-200", text: "text-ink-500", dot: "bg-surface-400" },
  }[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full px-2.5 py-0.5", config.bg, config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot, status === "live" || status === "active" ? "animate-pulse" : "")} />
      {config.label}
    </span>
  );
}

/* ── Section Wrapper ───────────────────────────────────────────────────── */

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-5">
      <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
        <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

interface ArchitectureClientProps {
  user: { email: string; displayName?: string | null };
}

export function ArchitectureClient({ user }: ArchitectureClientProps) {
  const totalRoutes = API_ROUTE_GROUPS.reduce((s, g) => s + g.count, 0);
  const totalTables = DB_TABLE_GROUPS.reduce((s, g) => s + g.tables.length, 0);
  const liveServices = MICROSERVICES.filter((s) => s.status === "live").length;
  const totalProviderModels = AI_PROVIDERS.reduce((s, p) => s + p.modelCount, 0);
  const freeModels = AI_PROVIDERS.filter((p) => p.tier === "1").reduce((s, p) => s + p.modelCount, 0);

  return (
    <AdminLayout user={user}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-ink-800 flex items-center justify-center gap-3">
            <Layers strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
            System Architecture
          </h1>
          <p className="text-sm text-ink-600 mt-2 max-w-xl mx-auto">
            Complete internal visualization of the BlockID.au platform infrastructure.
          </p>
        </div>

        {/* ── Quick Stats ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "AI Providers", value: "9", sub: `${freeModels} free models`, icon: Zap, color: "text-brand-600", bg: "bg-brand-50" },
            { label: "API Routes", value: String(totalRoutes), sub: "across 12 domains", icon: Route, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "DB Tables", value: String(totalTables), sub: "6 domain groups", icon: Database, color: "text-teal-600", bg: "bg-teal-50" },
            { label: "Microservices", value: String(MICROSERVICES.length), sub: `${liveServices} live`, icon: Server, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Cron Jobs", value: String(CRON_JOBS.length), sub: "automated", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Env Vars", value: "72", sub: "configured", icon: Lock, color: "text-rose-600", bg: "bg-rose-50" },
          ].map(({ label, value, sub, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-ink-500 font-medium">{label}</p>
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", bg)}>
                  <Icon strokeWidth={1.75} className={cn("h-3.5 w-3.5", color)} />
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-ink-800">{value}</p>
              <p className="text-[10px] text-ink-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════
            SECTION 1: SYSTEM OVERVIEW DIAGRAM
           ════════════════════════════════════════════════════════════ */}
        <Section id="overview" title="System Overview" icon={Network}>
          <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Row 1: Browser -> Cloudflare -> Next.js -> Supabase */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <DiagramBox icon={Monitor} label="Browser" sub="User" color="bg-blue-50 border-blue-200 text-blue-700" />
                <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
                <DiagramBox icon={Cloud} label="Cloudflare CDN" sub="Edge Cache + SSL" color="bg-orange-50 border-orange-200 text-orange-700" />
                <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
                <DiagramBox icon={Globe} label="Next.js :4001" sub="Monolith" color="bg-brand-50 border-brand-200 text-brand-700" highlight />
                <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
                <DiagramBox icon={Database} label="Supabase DB" sub="PostgreSQL" color="bg-emerald-50 border-emerald-200 text-emerald-700" />
              </div>

              {/* Connector */}
              <div className="flex justify-center my-3">
                <div className="flex flex-col items-center">
                  <div className="w-px h-4 bg-surface-300" />
                  <div className="h-1.5 w-1.5 rounded-full bg-surface-400" />
                  <div className="w-px h-4 bg-surface-300" />
                </div>
              </div>

              {/* Row 2: Internal services */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <DiagramBox icon={Zap} label="AI Gateway :4010" sub="Fastify" color="bg-purple-50 border-purple-200 text-purple-700" />
                <DiagramBox icon={Cpu} label="Billing :4011" sub="Fastify" color="bg-teal-50 border-teal-200 text-teal-700" />
                <DiagramBox icon={Activity} label="Redis :6379" sub="Cache + Queue" color="bg-red-50 border-red-200 text-red-700" />
                <DiagramBox icon={Box} label="Ollama :11434" sub="Local LLM" color="bg-amber-50 border-amber-200 text-amber-700" />
                <DiagramBox icon={Shield} label="Cosmos Chain" sub="Blockchain" color="bg-indigo-50 border-indigo-200 text-indigo-700" />
              </div>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 2: AI PROVIDER CHAIN
           ════════════════════════════════════════════════════════════ */}
        <Section id="ai-providers" title="AI Provider Chain (9 Providers, Priority Order)" icon={Zap}>
          <div className="space-y-4">
            {["1", "2", "3", "4"].map((tier) => {
              const providers = AI_PROVIDERS.filter((p) => p.tier === tier);
              const tierConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
                "1": { label: "TIER 1 - FREE", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
                "2": { label: "TIER 2 - SUBSCRIPTION", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
                "3": { label: "TIER 3 - PAID API", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
                "4": { label: "TIER 4 - LOCAL", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
              };
              const cfg = tierConfig[tier];

              return (
                <div key={tier} className={cn("rounded-2xl border p-5 shadow-sm", cfg.border, cfg.bg)}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
                    <span className="text-[10px] text-ink-500">({providers.reduce((s, p) => s + p.modelCount, 0)} models)</span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {providers.map((provider) => (
                      <div key={provider.name} className="rounded-xl border border-surface-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-ink-800">{provider.name}</span>
                          <StatusBadge status={provider.status} />
                        </div>
                        <p className="text-[11px] text-ink-600 font-mono line-clamp-2 mb-2">{provider.models}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ink-500">{provider.modelCount} model{provider.modelCount > 1 ? "s" : ""}</span>
                          <span className="text-[10px] font-mono text-ink-600">{provider.costPer1k}/1K tok</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 3: DATABASE SCHEMA
           ════════════════════════════════════════════════════════════ */}
        <Section id="database" title={`Database Schema (${totalTables} Tables)`} icon={Database}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DB_TABLE_GROUPS.map((group) => (
              <div key={group.domain} className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", group.bgColor)}>
                    <Database strokeWidth={1.75} className={cn("h-3.5 w-3.5", group.color)} />
                  </div>
                  <div>
                    <span className={cn("text-sm font-semibold", group.color)}>{group.domain}</span>
                    <span className="text-[10px] text-ink-400 ml-2">{group.tables.length} tables</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {group.tables.map((table) => (
                    <div key={table} className="flex items-center gap-2 text-[11px] font-mono text-ink-600">
                      <span className={cn("h-1 w-1 rounded-full shrink-0", group.color.replace("text-", "bg-"))} />
                      {table}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 4: MICROSERVICES STATUS
           ════════════════════════════════════════════════════════════ */}
        <Section id="services" title="Microservices Status" icon={Server}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MICROSERVICES.map((service) => (
              <div key={service.name} className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
                    <span className="text-sm font-semibold text-ink-800">{service.name}</span>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400 font-medium w-12">Port</span>
                    <span className="text-[11px] font-mono text-ink-700">{service.port}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400 font-medium w-12">Stack</span>
                    <span className="text-[11px] font-mono text-ink-700">{service.runtime}</span>
                  </div>
                  <p className="text-[11px] text-ink-500 pt-1 border-t border-surface-100">{service.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 5: API ROUTES SUMMARY
           ════════════════════════════════════════════════════════════ */}
        <Section id="api-routes" title={`API Routes Summary (${totalRoutes} Routes)`} icon={Route}>
          <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {API_ROUTE_GROUPS.map((group) => (
                <div key={group.domain} className="flex items-center gap-3 rounded-xl border border-surface-100 bg-surface-50 p-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold", group.color)}>
                    {group.count}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-800">{group.domain}</p>
                    <p className="text-[10px] text-ink-500">{group.count} endpoint{group.count > 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* Total bar */}
            <div className="mt-4 pt-4 border-t border-surface-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider text-ink-500 font-medium">Distribution</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex">
                {API_ROUTE_GROUPS.map((group) => (
                  <div
                    key={group.domain}
                    className={cn("h-full", group.color)}
                    style={{ width: `${(group.count / totalRoutes) * 100}%` }}
                    title={`${group.domain}: ${group.count}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 6: CRON SCHEDULE
           ════════════════════════════════════════════════════════════ */}
        <Section id="cron" title={`Cron Schedule (${CRON_JOBS.length} Jobs)`} icon={Timer}>
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-100">
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">Schedule</th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">Job Name</th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium hidden md:table-cell">Description</th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium hidden lg:table-cell">Endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {CRON_JOBS.map((job) => (
                    <tr key={job.name} className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-[11px] font-mono text-ink-700 bg-surface-100 rounded px-2 py-1">{job.schedule}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-semibold text-ink-800">{job.name}</span>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <span className="text-[11px] text-ink-600">{job.description}</span>
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell">
                        <span className="text-[10px] font-mono text-ink-500">{job.endpoint}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 7: ENVIRONMENT
           ════════════════════════════════════════════════════════════ */}
        <Section id="environment" title="Environment" icon={Shield}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Runtime",
                value: "Standalone Node.js",
                detail: "Zero-downtime swap deploy",
                icon: Server,
                color: "text-brand-600",
                bg: "bg-brand-50",
              },
              {
                label: "Environment Variables",
                value: "72 configured",
                detail: "NEXT_PUBLIC_* for client, server-only for API",
                icon: Lock,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "SSL Certificate",
                value: "Cloudflare Origin",
                detail: "Auto-renewed, edge-terminated TLS 1.3",
                icon: Shield,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "CDN",
                value: "Cloudflare",
                detail: "Edge caching, DDoS protection, WAF rules",
                icon: Cloud,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
            ].map(({ label, value, detail, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", bg)}>
                    <Icon strokeWidth={1.75} className={cn("h-4 w-4", color)} />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-ink-500 font-medium">{label}</span>
                </div>
                <p className="text-sm font-semibold text-ink-800">{value}</p>
                <p className="text-[10px] text-ink-500 mt-1">{detail}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </AdminLayout>
  );
}

/* ── Diagram Box Helper ────────────────────────────────────────────────── */

function DiagramBox({
  icon: Icon,
  label,
  sub,
  color,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 px-4 py-3 text-center min-w-[120px]",
        color,
        highlight && "ring-2 ring-brand-300 ring-offset-2",
      )}
    >
      <Icon strokeWidth={1.75} className="h-5 w-5 mx-auto mb-1" />
      <p className="text-xs font-bold">{label}</p>
      <p className="text-[10px] opacity-70">{sub}</p>
    </div>
  );
}
