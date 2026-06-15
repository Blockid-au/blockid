// POST /api/cron/security-posture — CISO security posture snapshot.
//
// Deterministic scan (no AI) that grades the platform against a compact
// Essential Eight–aligned scorecard. Writes a dated snapshot + a rolling
// posture-history.jsonl + a stable security-posture.json (latest).
//
// Scored dimensions (each 0-10):
//   1. Auth coverage    — every /api/* route either Bearer-secret-gated, user-auth,
//                         or explicitly public-allowed.
//   2. Rate-limit       — every /api/* route calls checkRateLimit OR is public-static.
//   3. Secrets hygiene  — no LINKEDIN_*, STRIPE_*, SUPABASE_SERVICE_*, GROQ_*, etc.
//                         committed under web/src/ or web/content/.
//   4. CSP / headers    — middleware.ts present + sets CSP + X-Frame + X-Content-Type.
//   5. Dependency vulns — npm audit summary (high/critical count).
//   6. Supabase RLS     — % of tables in supabase/migrations with RLS enabled.
//   7. Deploy hygiene   — last deploy < 7d, git push not behind > 5 commits.
//
// Schedule: daily 22:30 UTC (08:30 AEST). Cheap (~5s). Surfaces straight into
// CISO daily brief via content/reports/security-posture.json.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTelegram, mdEscape } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const execAsync = promisify(exec);
const CRON_SECRET = process.env.CRON_SECRET;
const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const REPORTS_DIR = `${WEB_DIR}/content/reports`;
const LATEST_FILE = `${REPORTS_DIR}/security-posture.json`;
const HISTORY_FILE = `${REPORTS_DIR}/security-posture-history.jsonl`;

interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-10
  detail: string;
  findings: string[];
}

interface PostureSnapshot {
  date: string;
  overall: number; // 0-100
  status: "GREEN" | "YELLOW" | "RED";
  dimensions: DimensionScore[];
  recommendations: string[];
}

async function sh(cmd: string, timeout = 20_000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { cwd: WEB_DIR, timeout, maxBuffer: 4_000_000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

function listRouteFiles(): string[] {
  const apiDir = `${WEB_DIR}/src/app/api`;
  const files: string[] = [];
  function walk(d: string) {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts" || e.name === "route.tsx") files.push(p);
    }
  }
  walk(apiDir);
  return files;
}

async function scoreAuthCoverage(): Promise<DimensionScore> {
  const routes = listRouteFiles();
  let guarded = 0;
  const ungated: string[] = [];
  for (const file of routes) {
    let body = "";
    try { body = fs.readFileSync(file, "utf8"); } catch { continue; }
    const hasBearer = /CRON_SECRET|process\.env\.CRON_SECRET|Bearer/i.test(body);
    const hasUserAuth = /getCurrentUser|requireUser|getServerSession/.test(body);
    const isPublic = /\/\/\s*PUBLIC|@public-route/i.test(body);
    if (hasBearer || hasUserAuth || isPublic) guarded++;
    else ungated.push(file.replace(`${WEB_DIR}/src/app/`, ""));
  }
  const ratio = routes.length === 0 ? 1 : guarded / routes.length;
  const score = Math.round(ratio * 10);
  return {
    key: "auth_coverage",
    label: "Auth coverage on /api/* routes",
    score,
    detail: `${guarded}/${routes.length} guarded (Bearer / user-auth / public-tagged)`,
    findings: ungated.slice(0, 8).map(f => `Ungated: ${f}`),
  };
}

async function scoreRateLimit(): Promise<DimensionScore> {
  const routes = listRouteFiles();
  let rated = 0;
  const missing: string[] = [];
  for (const file of routes) {
    let body = "";
    try { body = fs.readFileSync(file, "utf8"); } catch { continue; }
    if (/checkRateLimit\s*\(|@rate-limit-exempt/.test(body)) rated++;
    else missing.push(file.replace(`${WEB_DIR}/src/app/`, ""));
  }
  const ratio = routes.length === 0 ? 1 : rated / routes.length;
  return {
    key: "rate_limit",
    label: "Rate-limit coverage on /api/* routes",
    score: Math.round(ratio * 10),
    detail: `${rated}/${routes.length} call checkRateLimit (or @rate-limit-exempt)`,
    findings: missing.slice(0, 8).map(f => `No rate-limit: ${f}`),
  };
}

async function scoreSecrets(): Promise<DimensionScore> {
  // Look for likely-leaked secret patterns committed under src/ or content/
  const patterns = [
    "STRIPE_SECRET_KEY=sk_",
    "SUPABASE_SERVICE_ROLE_KEY=ey",
    "LINKEDIN_PAGE_ACCESS_TOKEN=",
    "GROQ_API_KEY=gsk_",
    "OPENAI_API_KEY=sk-",
    "ANTHROPIC_API_KEY=sk-ant",
  ];
  const grepRe = patterns.map(p => `-e "${p}"`).join(" ");
  const hits = await sh(`grep -rEn ${grepRe} src/ content/ 2>/dev/null | head -20`);
  const leakLines = hits.split("\n").filter(Boolean);
  const score = leakLines.length === 0 ? 10 : Math.max(0, 10 - leakLines.length * 3);
  return {
    key: "secrets_hygiene",
    label: "Secrets hygiene (no committed credentials)",
    score,
    detail: leakLines.length === 0 ? "No leaked secret patterns in committed code" : `${leakLines.length} suspicious lines`,
    findings: leakLines.slice(0, 5).map(l => `Leak: ${l.slice(0, 160)}`),
  };
}

async function scoreCspHeaders(): Promise<DimensionScore> {
  let mw = "";
  try { mw = fs.readFileSync(`${WEB_DIR}/src/middleware.ts`, "utf8"); } catch { /* missing */ }
  const checks = {
    csp: /Content-Security-Policy/i.test(mw),
    xframe: /X-Frame-Options|frame-ancestors/i.test(mw),
    xcontent: /X-Content-Type-Options/i.test(mw),
    referrer: /Referrer-Policy/i.test(mw),
    permissions: /Permissions-Policy/i.test(mw),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const findings: string[] = [];
  if (!checks.csp) findings.push("Missing Content-Security-Policy header");
  if (!checks.xframe) findings.push("Missing X-Frame-Options / frame-ancestors");
  if (!checks.xcontent) findings.push("Missing X-Content-Type-Options");
  if (!checks.referrer) findings.push("Missing Referrer-Policy");
  if (!checks.permissions) findings.push("Missing Permissions-Policy");
  return {
    key: "csp_headers",
    label: "CSP + security headers (middleware)",
    score: Math.round((passed / 5) * 10),
    detail: `${passed}/5 standard headers set`,
    findings,
  };
}

async function scoreDeps(): Promise<DimensionScore> {
  const out = await sh("npm audit --json 2>/dev/null | head -c 50000", 30_000);
  let crit = 0;
  let high = 0;
  let mod = 0;
  try {
    const parsed = JSON.parse(out) as { metadata?: { vulnerabilities?: Record<string, number> } };
    const v = parsed.metadata?.vulnerabilities ?? {};
    crit = v.critical ?? 0;
    high = v.high ?? 0;
    mod = v.moderate ?? 0;
  } catch { /* npm audit can fail in offline mode */ }
  // Score: 10 if 0 high/crit. -3 per crit, -1 per high, -0.2 per moderate.
  const score = Math.max(0, Math.round(10 - crit * 3 - high * 1 - mod * 0.2));
  const findings: string[] = [];
  if (crit > 0) findings.push(`${crit} critical CVE(s)`);
  if (high > 0) findings.push(`${high} high CVE(s)`);
  if (mod > 0) findings.push(`${mod} moderate CVE(s)`);
  return {
    key: "deps",
    label: "Dependency vulnerabilities",
    score,
    detail: `crit ${crit}, high ${high}, mod ${mod}`,
    findings,
  };
}

async function scoreSupabaseRls(): Promise<DimensionScore> {
  const migDir = `${WEB_DIR}/../supabase/migrations`;
  let files: string[] = [];
  try { files = fs.readdirSync(migDir).filter(f => f.endsWith(".sql")); } catch { /* may not exist */ }
  if (files.length === 0) {
    return {
      key: "supabase_rls",
      label: "Supabase RLS enabled across tables",
      score: 5,
      detail: "supabase/migrations dir not found — unable to verify",
      findings: ["Cannot read supabase/migrations to verify RLS coverage"],
    };
  }
  const created = new Set<string>();
  const rlsEnabled = new Set<string>();
  for (const f of files) {
    let body = "";
    try { body = fs.readFileSync(`${migDir}/${f}`, "utf8"); } catch { continue; }
    for (const m of body.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?/gi)) {
      created.add(m[1]);
    }
    for (const m of body.matchAll(/alter\s+table\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s+enable\s+row\s+level\s+security/gi)) {
      rlsEnabled.add(m[1]);
    }
  }
  const tables = [...created];
  const ratio = tables.length === 0 ? 1 : tables.filter(t => rlsEnabled.has(t)).length / tables.length;
  const missing = tables.filter(t => !rlsEnabled.has(t));
  return {
    key: "supabase_rls",
    label: "Supabase RLS enabled across tables",
    score: Math.round(ratio * 10),
    detail: `${tables.length - missing.length}/${tables.length} tables have RLS enabled in migrations`,
    findings: missing.slice(0, 8).map(t => `No RLS migration found for table: ${t}`),
  };
}

async function scoreDeployHygiene(): Promise<DimensionScore> {
  const lastDeploy = await sh("tail -1 content/reports/deploy-log.jsonl 2>/dev/null");
  let deployAgeDays = 999;
  try {
    const entry = JSON.parse(lastDeploy) as { time?: string };
    if (entry.time) deployAgeDays = (Date.now() - Date.parse(entry.time)) / (24 * 60 * 60 * 1000);
  } catch { /* skip */ }
  const unpushed = parseInt(await sh("git rev-list --count origin/master..HEAD 2>/dev/null") || "0", 10);
  const findings: string[] = [];
  if (deployAgeDays > 7) findings.push(`Last deploy was ${Math.round(deployAgeDays)} days ago`);
  if (unpushed > 5) findings.push(`${unpushed} unpushed local commits (drift risk)`);
  let score = 10;
  if (deployAgeDays > 7) score -= 4;
  if (deployAgeDays > 14) score -= 3;
  if (unpushed > 5) score -= 3;
  return {
    key: "deploy_hygiene",
    label: "Deploy hygiene",
    score: Math.max(0, score),
    detail: `last deploy ${Math.round(deployAgeDays)}d ago, ${unpushed} unpushed commits`,
    findings,
  };
}

function buildRecommendations(dims: DimensionScore[]): string[] {
  const recs: string[] = [];
  const weakest = [...dims].sort((a, b) => a.score - b.score).slice(0, 3);
  for (const d of weakest) {
    if (d.score >= 9) continue;
    if (d.key === "rate_limit" && d.score < 7) recs.push("Add checkRateLimit() to every /api/* route or tag with @rate-limit-exempt comment");
    if (d.key === "auth_coverage" && d.score < 9) recs.push("Audit ungated routes — add Bearer or user-auth guard; mark intentional public with @public-route");
    if (d.key === "secrets_hygiene" && d.score < 10) recs.push("Move leaked secret patterns out of repo; rotate any exposed credentials immediately");
    if (d.key === "csp_headers" && d.score < 8) recs.push("Add missing security headers to src/middleware.ts (CSP, X-Frame, X-Content-Type, Referrer, Permissions)");
    if (d.key === "deps" && d.score < 7) recs.push("Run `npm audit fix` for moderate; manually upgrade high/critical");
    if (d.key === "supabase_rls" && d.score < 9) recs.push("Add `alter table <name> enable row level security` migrations for uncovered tables");
    if (d.key === "deploy_hygiene" && d.score < 8) recs.push("Run deploy-live.sh during next off-peak window + git push outstanding commits");
  }
  return recs;
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit("security-posture", 4, 600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });
  }

  const dims = await Promise.all([
    scoreAuthCoverage(),
    scoreRateLimit(),
    scoreSecrets(),
    scoreCspHeaders(),
    scoreDeps(),
    scoreSupabaseRls(),
    scoreDeployHygiene(),
  ]);

  // Overall: weighted average × 10 → 0–100.
  const overall = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length * 10);
  const status: PostureSnapshot["status"] = overall >= 80 ? "GREEN" : overall >= 60 ? "YELLOW" : "RED";

  const snapshot: PostureSnapshot = {
    date: new Date().toISOString().slice(0, 10),
    overall,
    status,
    dimensions: dims,
    recommendations: buildRecommendations(dims),
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(LATEST_FILE, JSON.stringify(snapshot, null, 2) + "\n");
  fs.appendFileSync(HISTORY_FILE, JSON.stringify({ ts: new Date().toISOString(), ...snapshot }) + "\n");

  // Telegram only when posture drops or there are RED dimensions
  const redDims = dims.filter(d => d.score < 5);
  if (status === "RED" || redDims.length > 0) {
    const summary = [
      `🔒 *Security posture ${mdEscape(snapshot.date)} — ${mdEscape(status)}*`,
      `Overall: ${overall}/100`,
      ...redDims.slice(0, 4).map(d => mdEscape(`🔴 ${d.label}: ${d.score}/10 — ${d.detail}`)),
      ``,
      ...snapshot.recommendations.slice(0, 3).map(r => mdEscape(`→ ${r}`)),
    ].join("\n");
    await sendTelegram(summary).catch(() => { /* best-effort */ });
  }

  return NextResponse.json({
    ok: true,
    date: snapshot.date,
    overall,
    status,
    dimensions: dims.map(d => ({ key: d.key, score: d.score, detail: d.detail })),
    recommendationCount: snapshot.recommendations.length,
  });
}
