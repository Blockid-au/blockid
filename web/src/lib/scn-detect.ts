// src/lib/scn-detect.ts
//
// SCN context detection — turns whatever a founder gives us (an idea/biz
// description, a website URL, a GitHub repo, revenue numbers, or answers to
// follow-up questions) into a detected startup CONTEXT: stage, growth phase,
// a VC-grade valuation, the SCN follow-up questions still worth asking, and the
// next-best-action. This is the front door of the SCN model
// (Validation → Position → Value → Direction → Capital): detect where they are,
// then value and reason about what comes next — all from the evidence given.
//
// Composes the existing brains: extractSignals/detectStage (svi-analysis),
// getCurrentPhase (startup-growth-phases) and buildVcValuationReport
// (agents/cfo-valuation). Network calls (website fetch, GitHub audit) are
// injected so the core is deterministic and unit-testable.

import {
  extractSignals,
  detectStage,
  SVI_STAGE_LABELS,
  type SVIExtractedSignals,
} from "./svi-analysis";
import { getCurrentPhase } from "./startup-growth-phases";
import { buildVcValuationReport, type VcValuationReport } from "./agents/cfo-valuation";

export type ScnInputType = "idea" | "website" | "github" | "revenue" | "mixed";

export interface ScnInput {
  /** Free-text idea / business description / answers to follow-up questions. */
  text?: string;
  websiteUrl?: string;
  githubUrl?: string;
  mrrAud?: number;
  sector?: string;
  monthlyGrowthRatePct?: number;
}

export interface ScnContext {
  inputType: ScnInputType;
  stage: number; // 0-7
  stageLabel: string;
  phase: { id: string; order: number; title: string; subtitle: string };
  signals: SVIExtractedSignals;
  valuation: VcValuationReport;
  confidence: number; // 0-100
  evidence: string[]; // what we detected and why the stage lifted
  followUpQuestions: string[]; // SCN questions still worth asking
  nextBestAction: string; // weakest SCN layer → the next move
}

// Injectable network adapters (kept out of the deterministic core).
export interface ScnDeps {
  /** Fetch a URL and return plain text/HTML. */
  fetchUrl?: (url: string) => Promise<string>;
  /** Audit a GitHub repo "owner/name"; returns coarse product signals. */
  auditRepo?: (repoFullName: string) => Promise<{ hasSourceCode: boolean; hasProduct: boolean; activity: "active" | "stale" | "unknown"; evidence: string }>;
}

// ── Input typing ────────────────────────────────────────────────────────────

const GITHUB_RE = /github\.com\/([\w.-]+\/[\w.-]+)/i;
const URL_RE = /^https?:\/\//i;

export function detectInputType(input: ScnInput): ScnInputType {
  const provided = [
    input.text?.trim() ? "idea" : null,
    input.websiteUrl?.trim() ? "website" : null,
    input.githubUrl?.trim() || (input.text && GITHUB_RE.test(input.text)) ? "github" : null,
    input.mrrAud && input.mrrAud > 0 ? "revenue" : null,
  ].filter(Boolean) as ScnInputType[];
  if (provided.length === 0) return "idea";
  if (provided.length > 1) return "mixed";
  return provided[0];
}

export function parseGithubFullName(url: string): string | null {
  const m = url.match(GITHUB_RE);
  return m ? m[1].replace(/\.git$/, "") : null;
}

// ── Sector heuristic ─────────────────────────────────────────────────────────

export function guessSector(text: string): string {
  const t = text.toLowerCase();
  if (/\b(ai|machine learning|llm|genai|model)\b/.test(t)) return "ai";
  if (/\b(fintech|payment|lending|banking|wallet|crypto)\b/.test(t)) return "fintech";
  if (/\b(marketplace|two-sided|gig|platform connecting)\b/.test(t)) return "marketplace";
  if (/\b(health|medical|clinic|patient|telehealth)\b/.test(t)) return "healthtech";
  if (/\b(ecommerce|e-commerce|shop|retail|d2c)\b/.test(t)) return "ecommerce";
  if (/\b(hardware|robot|biotech|deep tech|semiconductor)\b/.test(t)) return "deeptech";
  if (/\b(saas|b2b|software|subscription|api)\b/.test(t)) return "saas";
  return "default";
}

// ── Lightweight website analysis (works on fetched text/HTML) ────────────────

export interface WebsiteAnalysis {
  hasWebsite: boolean;
  hasProduct: boolean;
  hasPricing: boolean;
  hasAuth: boolean;
  features: string[];
  evidence: string;
}

export function analyzeWebsiteText(html: string): WebsiteAnalysis {
  const t = html.toLowerCase();
  const has = (...keys: string[]) => keys.some(k => t.includes(k));
  const hasPricing = has("pricing", "/pricing", "per month", "/mo", "free trial", "plans");
  const hasAuth = has("log in", "login", "sign in", "sign up", "signup", "get started", "dashboard");
  const hasApp = has("app.", "dashboard", "console", "api", "integration", "download the app");
  const features: string[] = [];
  for (const f of ["pricing", "dashboard", "api", "integrations", "mobile app", "free trial", "demo", "case study", "customers", "testimonial"]) {
    if (t.includes(f)) features.push(f);
  }
  const hasProduct = hasAuth || hasApp || features.length >= 3;
  return {
    hasWebsite: true,
    hasProduct,
    hasPricing,
    hasAuth,
    features,
    evidence: `Website live with ${features.length} product signals${hasPricing ? ", pricing page" : ""}${hasAuth ? ", auth/app" : ""} → lifts above Idea.`,
  };
}

// ── SCN follow-up questions (per layer, asked when evidence is thin) ─────────

function followUps(signals: SVIExtractedSignals, stage: number): string[] {
  const q: string[] = [];
  if (signals.problemClarity !== "validated" && signals.problemClarity !== "clear")
    q.push("VALIDATION — Who exactly has this problem, and how have you confirmed they'll pay to solve it?");
  if (!signals.hasCustomers && !signals.hasRevenue)
    q.push("POSITION — Do you have any users or pilots yet? How many, and how engaged?");
  if (!signals.hasRevenue)
    q.push("VALUE — What's your pricing / business model, and any revenue so far (MRR)?");
  if (stage < 4)
    q.push("DIRECTION — What's the single biggest thing blocking your next milestone?");
  if (!signals.hasCapTable || !signals.hasDataRoom)
    q.push("CAPITAL — Are you raising? Do you have a cap table and data room ready?");
  return q.slice(0, 4);
}

function nextBestAction(signals: SVIExtractedSignals, stage: number): string {
  if (stage <= 1) return "Validate the problem with 10+ target-customer interviews and capture willingness-to-pay.";
  if (!signals.hasRevenue) return "Ship a paid pilot — convert one user to a paying customer to prove the model.";
  if (signals.revenueBand === "early") return "Find a repeatable acquisition channel and lift activation/retention before scaling spend.";
  if (!signals.hasDataRoom || !signals.hasCapTable) return "Prepare the raise: build the data room, clean the cap table, and finalise the financial model.";
  return "Double down on the growth channel with the best CAC payback and defend retention.";
}

// ── Main: build the SCN context ──────────────────────────────────────────────

export async function buildScnContext(input: ScnInput, deps: ScnDeps = {}): Promise<ScnContext> {
  const inputType = detectInputType(input);
  const evidence: string[] = [];
  let baseText = input.text ?? "";

  // 1. Website — fetch + analyse → product/feature signals that lift the stage.
  let web: WebsiteAnalysis | null = null;
  if (input.websiteUrl && URL_RE.test(input.websiteUrl) && deps.fetchUrl) {
    try {
      const html = await deps.fetchUrl(input.websiteUrl);
      web = analyzeWebsiteText(html);
      baseText += ` website ${input.websiteUrl} ${web.features.join(" ")}`;
      evidence.push(web.evidence);
    } catch {
      evidence.push("Website provided but could not be fetched — treated as a landing-page signal only.");
      baseText += " website landing page";
    }
  } else if (input.websiteUrl) {
    baseText += " website landing page";
  }

  // 2. GitHub — audit source → product/source signals.
  let repo: Awaited<ReturnType<NonNullable<ScnDeps["auditRepo"]>>> | null = null;
  const ghFull = input.githubUrl ? parseGithubFullName(input.githubUrl) : (input.text ? parseGithubFullName(input.text) : null);
  if (ghFull && deps.auditRepo) {
    try {
      repo = await deps.auditRepo(ghFull);
      baseText += ` github ${ghFull} source code repository`;
      evidence.push(repo.evidence);
    } catch {
      evidence.push("GitHub repo provided but could not be audited — treated as a source-code signal.");
      baseText += " github source code repository";
    }
  } else if (ghFull) {
    baseText += " github source code repository";
    evidence.push("GitHub repo detected → source-code signal.");
  }

  // 3. Revenue → traction signals.
  if (input.mrrAud && input.mrrAud > 0) {
    const arr = input.mrrAud * 12;
    baseText += arr >= 1_000_000 ? " $1m arr scaling revenue paying customers"
      : arr >= 100_000 ? " growing revenue mrr paying customers"
      : " early revenue mrr paying";
    evidence.push(`Revenue A$${Math.round(input.mrrAud).toLocaleString()}/mo (≈A$${Math.round(arr).toLocaleString()} ARR) → traction signal.`);
  }

  // 4. Extract signals from the assembled evidence, then apply hard overrides
  //    from the live website / repo so detection beats keyword guessing.
  const signals = extractSignals({ rawText: baseText || "early stage idea" });
  if (web) { signals.hasWebsite = true; if (web.hasProduct) signals.hasProduct = true; }
  if (repo) { signals.hasSourceCode = true; if (repo.hasProduct) signals.hasProduct = true; }

  const stage = detectStage(signals);
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  const phase = getCurrentPhase(stage);

  // 5. Drive the VC-grade valuation from the detected context.
  const sector = input.sector ?? guessSector(baseText);
  const stageName = stage >= 6 ? "growth" : stage >= 5 ? "series-b" : stage >= 4 ? "series-a" : stage >= 2 ? "seed" : "pre-seed";
  const valuation = buildVcValuationReport({
    sector,
    stage: stageName,
    mrrAud: input.mrrAud,
    monthlyGrowthRatePct: input.monthlyGrowthRatePct,
  });

  // 6. Confidence rises with the strength + number of evidence sources.
  const confidence = Math.min(90, 30 + evidence.length * 12 + (input.mrrAud ? 18 : 0) + (web?.hasProduct ? 10 : 0) + (repo ? 8 : 0));

  return {
    inputType,
    stage,
    stageLabel,
    phase: { id: phase.id, order: phase.order, title: phase.title, subtitle: phase.subtitle },
    signals,
    valuation,
    confidence,
    evidence,
    followUpQuestions: followUps(signals, stage),
    nextBestAction: nextBestAction(signals, stage),
  };
}
