// src/lib/agents/grant-advisor-narrative.ts
//
// LLM narrative for the funding plan (T0240 §4c). One serial `callAI` at
// temperature 0.4 (same pattern as accelerator-drafter.ts), then two guards:
//
//   1. `auditText()` (llm-auditor critic → reviser) fed by a thin adapter that
//      turns `callAI` into the ADK `ModelCaller` shape `(system, user,
//      maxTokens) => Promise<string>`. `callAIToModelCaller` in
//      agent-dispatcher.ts returns the *structured* transport shape, not the
//      ADK one, so a 6-line local adapter is the straightforward route.
//   2. A deterministic name guard: any sentence that names a grant / program
//      from the full catalogue that is NOT in the top lists (or one of the
//      well-known dead schemes) is dropped. `findUncitedClaims` keys on uuid
//      citations, which our slug `ref_id`s are not — so the regex guard is
//      the citation rule here.
//
// If the model throws, returns < 200 chars, or the guards strip it below the
// floor, a deterministic template built from the same lists is returned
// instead, so callers always get a usable narrative.

import type { AuGrantRow, AuProgramRow } from "@/lib/funding/seed-map";
import { callAI } from "@/lib/ai-client";
import { auditText } from "@/lib/report-pipeline/llm-auditor";
import type { ModelCaller } from "@/lib/adk";
import type { GrantProfile, ScoredGrant, ScoredProgram, TimelineItem } from "./grant-advisor";
import { formatAud } from "./grant-advisor-rules";

export interface NarrativeInput {
  grants: ScoredGrant[];
  programs: ScoredProgram[];
  timeline: TimelineItem[];
  /** Full catalogue so the name guard can recognise rows the model was not given. */
  catalogue?: { grants: AuGrantRow[]; programs: AuProgramRow[] };
  /** Skip the critic/reviser pass (default: run it). */
  audit?: boolean;
  /** Full match counts when `grants`/`programs` are a top-N slice. */
  totals?: { grants: number; programs: number };
}

export interface NarrativeResult {
  narrative_md: string;
  actions: string[];
  source: "llm" | "template";
  /** Sentences removed by the name guard (for admin/debug). */
  stripped: string[];
  audit_findings: string[];
}

export const NARRATIVE_MIN_CHARS = 200;
const MAX_WORDS = 900;

export const GRANT_ADVISOR_SYSTEM = `You are BlockID's senior Australian startup funding analyst. You write in a warm, mentoring tone for a founder who is reading this alone at their kitchen table: plain English, second person, no hype.

Rules:
- All money in AUD, written as A$.
- Only recommend the grants and programs listed under GRANTS and PROGRAMS below and cite each one by its ref_id in square brackets the first time you name it, e.g. "MVP Ventures [nsw-mvp-ventures]". Never mention any other scheme, fund, accelerator or program by name.
- Never invent dates, amounts or eligibility rules — use the ones provided or say "check the official page".
- Respect the TIMING labels: "between rounds" means prepare now, do not say it is open.
- Keep it under ${MAX_WORDS} words. Use markdown headings: "## Where you stand", "## Grants to pursue", "## Programs to join", "## Your next 12 months", "## Next actions".
- End with exactly three concrete next actions as a numbered list under "## Next actions", each starting with a verb and naming a ref_id where relevant.
- This is general information, not financial, tax or legal advice — say so once, briefly, at the end.`;

/** Well-known dead / paused schemes free models love to recommend (§6f "always flag"). */
const DEAD_SCHEME_NAMES = [
  "Techstars Sydney",
  "Techstars Australia",
  "Boosting Female Founders",
  "Accelerating Commercialisation",
  "Entrepreneurs' Programme",
  "Entrepreneurs Programme",
  "Industry Growth Program",
  "SXSW Sydney",
  "York Street Hub",
  "York St Hub",
  "METS Ignited",
  "SeedSpark",
  "Startmate Women Fellowship",
  "LaunchVic",
];

function summariseProfile(p: GrantProfile): string {
  const n = (v: number | null | undefined) => (typeof v === "number" ? formatAud(v) : "not provided");
  const lines = [
    `State / city: ${p.state}${p.city ? ` / ${p.city}` : ""}`,
    `Stage: ${p.stage.replace(/_/g, " ")}`,
    `Entity: ${p.entity_type ?? "not provided"}${p.incorporated_at ? `, incorporated ${p.incorporated_at}` : ""}`,
    `Turnover: ${n(p.turnover_aud)} · R&D spend: ${n(p.rd_spend_aud)} · Headcount: ${p.headcount ?? "not provided"}`,
    `Prior raise: ${n(p.prior_raise_aud)} · Funding need: ${n(p.funding_need_aud)}`,
    `Industry: ${(p.industry_tags ?? []).join(", ") || "not provided"}`,
    `Founder groups: ${(p.founder_demographics ?? []).join(", ") || "none declared"}`,
    `University affiliations: ${(p.university_affiliations ?? []).join(", ") || "none"}`,
    `Export intent: ${p.export_intent === true ? "yes" : p.export_intent === false ? "no" : "not provided"}`,
  ];
  if (p.description) lines.push(`Description: ${p.description.slice(0, 600)}`);
  return lines.join("\n");
}

function timingLabel(t: ScoredGrant["timing"]): string {
  switch (t) {
    case "open_now":
      return "OPEN NOW";
    case "rolling":
      return "rolling";
    case "opens_soon":
      return "opens within 90 days";
    case "between_rounds":
      return "between rounds (prepare now)";
    default:
      return "dates unconfirmed";
  }
}

function grantLine(g: ScoredGrant): string {
  const parts = [
    `[${g.ref_id}] ${g.name}`,
    `score ${g.score}`,
    timingLabel(g.timing),
    g.grant.amount_max_aud ? `up to ${formatAud(g.grant.amount_max_aud)}` : "amount varies",
  ];
  if (g.estimate_aud) parts.push(`estimate ${formatAud(g.estimate_aud)}`);
  const todo = g.eligibility_checklist.filter((c) => c.status === "unknown").map((c) => c.label);
  if (todo.length) parts.push(`to confirm: ${todo.slice(0, 3).join(", ")}`);
  parts.push(g.next_window.label);
  return `- ${parts.join(" · ")}`;
}

function programLine(p: ScoredProgram): string {
  const parts = [
    `[${p.ref_id}] ${p.name}`,
    `${p.program.program_type.replace(/_/g, " ")} in ${p.program.city}`,
    `score ${p.score}`,
    timingLabel(p.timing),
  ];
  if (p.program.funding_aud) parts.push(`${formatAud(p.program.funding_aud)}${p.program.equity_pct ? ` for ${p.program.equity_pct}` : ", equity-free"}`);
  parts.push(p.next_window.label);
  return `- ${parts.join(" · ")}`;
}

function timelineLine(t: TimelineItem): string {
  return `- ${t.month} · ${t.kind} · [${t.ref_id}] ${t.name}: ${t.action}${t.deadline ? ` (deadline ${t.deadline})` : ""}`;
}

export function buildNarrativePrompt(profile: GrantProfile, top: NarrativeInput): string {
  return [
    "## FOUNDER PROFILE",
    summariseProfile(profile),
    "",
    "## GRANTS (ranked, only these may be cited)",
    top.grants.length ? top.grants.map(grantLine).join("\n") : "- none matched",
    "",
    "## PROGRAMS (ranked, only these may be cited)",
    top.programs.length ? top.programs.map(programLine).join("\n") : "- none matched",
    "",
    "## TIMELINE (next 12 months)",
    top.timeline.length ? top.timeline.slice(0, 18).map(timelineLine).join("\n") : "- none",
    "",
    "Write the funding plan now.",
  ].join("\n");
}

// ─── Guards ──────────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip leading agency/prefix noise so "MVP Ventures Program (NSW)" also matches "MVP Ventures". */
function nameVariants(name: string): string[] {
  const base = name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const variants = new Set<string>([base]);
  const dashIdx = base.indexOf(" — ");
  if (dashIdx > 0) variants.add(base.slice(0, dashIdx).trim());
  const stripped = base.replace(/\b(Program|Programme|Grant|Grants|Fund|Initiative|Scheme)\b\s*$/i, "").trim();
  if (stripped.length >= 8) variants.add(stripped);
  return [...variants].filter((v) => v.length >= 6);
}

/**
 * Remove sentences that name a catalogue row not in the allowed lists, or a
 * known dead scheme. Returns the cleaned text and what was removed.
 */
export function stripUncitedNames(
  text: string,
  allowed: { grants: ScoredGrant[]; programs: ScoredProgram[] },
  catalogue?: { grants: AuGrantRow[]; programs: AuProgramRow[] },
): { text: string; stripped: string[] } {
  const allowedIds = new Set([...allowed.grants.map((g) => g.ref_id), ...allowed.programs.map((p) => p.ref_id)]);
  const allowedNames = new Set(
    [...allowed.grants.map((g) => g.name), ...allowed.programs.map((p) => p.name)].flatMap(nameVariants).map((s) => s.toLowerCase()),
  );
  const forbidden: string[] = [];
  for (const row of [...(catalogue?.grants ?? []), ...(catalogue?.programs ?? [])]) {
    if (allowedIds.has(row.id) || row.name === "__data_sources__") continue;
    for (const v of nameVariants(row.name)) {
      if (!allowedNames.has(v.toLowerCase())) forbidden.push(v);
    }
  }
  for (const dead of DEAD_SCHEME_NAMES) {
    if (!allowedNames.has(dead.toLowerCase())) forbidden.push(dead);
  }
  if (forbidden.length === 0) return { text, stripped: [] };
  const re = new RegExp(`\\b(?:${[...new Set(forbidden)].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})\\b`, "i");

  const stripped: string[] = [];
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!re.test(line)) {
      out.push(line);
      continue;
    }
    // Sentence-level removal inside the line; drop the whole line if nothing survives.
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        if (re.test(sentence)) {
          stripped.push(sentence.trim());
          return false;
        }
        return true;
      })
      .join(" ")
      .trim();
    if (kept && !/^[-*\d.)\s]*$/.test(kept)) out.push(kept);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), stripped };
}

/** Pull the numbered / bulleted items under "## Next actions". */
export function extractActions(md: string): string[] {
  const idx = md.search(/^#{1,3}\s*next actions/im);
  if (idx < 0) return [];
  const tail = md.slice(idx).split("\n").slice(1);
  const actions: string[] = [];
  for (const line of tail) {
    if (/^#{1,3}\s/.test(line)) break;
    const m = /^\s*(?:\d+[.)]|[-*•])\s+(.+)$/.exec(line);
    if (m) actions.push(m[1].trim());
  }
  return actions;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function truncateWords(s: string, max: number): string {
  const words = s.split(/\s+/);
  return words.length <= max ? s : words.slice(0, max).join(" ") + " …";
}

// ─── Template fallback ───────────────────────────────────────────────────────

export function templateNarrative(profile: GrantProfile, top: NarrativeInput): { narrative_md: string; actions: string[] } {
  const stage = profile.stage.replace(/_/g, " ");
  const grants = top.grants.slice(0, 5);
  const programs = top.programs.slice(0, 5);
  const timeline = top.timeline.slice(0, 8);
  const totalMax = grants.reduce((s, g) => s + (g.grant.amount_max_aud ?? 0), 0);
  const nGrants = top.totals?.grants ?? top.grants.length;
  const nPrograms = top.totals?.programs ?? top.programs.length;

  const lines: string[] = [];
  lines.push("## Where you stand");
  lines.push(
    `You are a ${stage} startup in ${profile.state}${profile.city ? ` (${profile.city})` : ""}. ` +
      `We matched ${nGrants} grant${nGrants === 1 ? "" : "s"} and ${nPrograms} program${nPrograms === 1 ? "" : "s"} against your profile` +
      (totalMax > 0 ? `; the top grants alone are worth up to ${formatAud(totalMax)} combined.` : "."),
  );
  lines.push("");
  lines.push("## Grants to pursue");
  if (grants.length === 0) lines.push("No grant clears your hard gates yet — fill in the missing profile fields and re-run.");
  for (const g of grants) {
    lines.push(
      `- **${g.name}** [${g.ref_id}] — ${g.why.slice(0, 2).join("; ")}` +
        (g.estimate_aud ? `. Estimated value ${formatAud(g.estimate_aud)}.` : ".") +
        ` Timing: ${timingLabel(g.timing)}.`,
    );
  }
  lines.push("");
  lines.push("## Programs to join");
  if (programs.length === 0) lines.push("No program matched — check your city and stage.");
  for (const p of programs) {
    lines.push(`- **${p.name}** [${p.ref_id}] — ${p.why.slice(0, 2).join("; ")}. Timing: ${timingLabel(p.timing)}.`);
  }
  lines.push("");
  lines.push("## Your next 12 months");
  if (timeline.length === 0) lines.push("Nothing dated yet.");
  for (const t of timeline) lines.push(`- **${t.month}** — ${t.action} [${t.ref_id}]`);
  lines.push("");
  lines.push("## Next actions");
  const actions = deriveActions(top);
  actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");
  lines.push("_General information only — not financial, tax or legal advice. Confirm eligibility and dates on each official page._");
  return { narrative_md: lines.join("\n"), actions };
}

function deriveActions(top: NarrativeInput): string[] {
  const actions: string[] = [];
  for (const t of top.timeline) {
    if (actions.length >= 3) break;
    if (t.kind === "milestone") continue;
    actions.push(`${t.action} [${t.ref_id}]`);
  }
  if (actions.length < 3) {
    for (const g of top.grants) {
      if (actions.length >= 3) break;
      actions.push(`Read the official page for ${g.name} [${g.ref_id}] and confirm the items marked "to confirm".`);
    }
  }
  if (actions.length < 3) {
    for (const p of top.programs) {
      if (actions.length >= 3) break;
      actions.push(`Register interest with ${p.name} [${p.ref_id}].`);
    }
  }
  while (actions.length < 3) {
    actions.push(
      actions.length === 0
        ? "Complete your grant profile (turnover, R&D spend, incorporation date) so the tax items can be estimated."
        : "Book 30 minutes with a registered tax agent to confirm R&DTI and ESIC positions before you apply.",
    );
  }
  return actions.slice(0, 3);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** ADK `ModelCaller` over the free provider chain, for `auditText()`. */
export function grantAdvisorModelCaller(temperature = 0.2): ModelCaller {
  return async (system, user, maxTokens) => {
    const res = await callAI({ system, user, maxTokens, temperature, agentId: "grant-advisor" });
    return res.text ?? "";
  };
}

/**
 * Narrate the plan. One serial LLM call at temperature 0.4, audited and
 * name-guarded; deterministic template on any failure.
 */
export async function narrateFundingPlan(profile: GrantProfile, top: NarrativeInput): Promise<NarrativeResult> {
  const fallback = () => {
    const t = templateNarrative(profile, top);
    return { ...t, source: "template" as const, stripped: [], audit_findings: [] };
  };

  let draft: string;
  try {
    const res = await callAI({
      system: GRANT_ADVISOR_SYSTEM,
      user: buildNarrativePrompt(profile, top),
      maxTokens: 1600,
      temperature: 0.4,
      timeoutMs: 90_000,
      agentId: "grant-advisor",
    });
    draft = (res.text ?? "").trim();
  } catch {
    return fallback();
  }
  if (draft.length < NARRATIVE_MIN_CHARS) return fallback();

  // Guard 1 — llm-auditor critic → reviser against the exact lists we supplied.
  let audited = draft;
  let findings: string[] = [];
  if (top.audit !== false) {
    try {
      const evidence = buildNarrativePrompt(profile, top);
      const result = await auditText(draft, evidence, grantAdvisorModelCaller(), 2000);
      findings = result.findings;
      if (result.revised.trim().length >= NARRATIVE_MIN_CHARS) audited = result.revised.trim();
    } catch {
      /* auditor is fail-safe; keep the draft */
    }
  }

  // Guard 2 — deterministic name guard.
  const guarded = stripUncitedNames(audited, { grants: top.grants, programs: top.programs }, top.catalogue);
  let narrative = guarded.text;
  if (narrative.length < NARRATIVE_MIN_CHARS) return fallback();
  if (wordCount(narrative) > MAX_WORDS + 60) narrative = truncateWords(narrative, MAX_WORDS);

  let actions = extractActions(narrative);
  if (actions.length < 3) actions = [...actions, ...deriveActions(top)].slice(0, 3);

  return { narrative_md: narrative, actions, source: "llm", stripped: guarded.stripped, audit_findings: findings };
}
