// G19-S46 — BlockID's own Trusted Business Report: the pure core behind
// `scripts/run-self-analysis.mjs --report`. No I/O here — the script owns
// env, the Supabase client and the tsx-loaded pipeline; this module owns:
//
//   * BLOCKID_RAW_INPUT / BLOCKID_CRITERIA — the public facts about BlockID
//     (SOURCE-OF-TRUTH §G14/G19 + content/pitch/pitch-deck-v3.md) written the
//     way a founder writes them into /analyze and the 13-criteria form. Every
//     figure is one the deck's provenance table confirms; revenue is stated
//     as pre-revenue (Stripe: 0 subscriptions, 5 one-off A$3 charges) and no
//     projection is written as a fact;
//   * pickCanonicalProject — admin@blockid.au's "blockid" project with the
//     most svi_snapshots (or the id the operator passed);
//   * criteriaSeedRows / needsCriteriaSeed — the evaluation_criteria upsert
//     rows (quality level mirrors lib/evaluation-criteria.ts computeQuality);
//   * runSelfReport — resolve → (seed → re-score) → runTrustReportForProject
//     → summary, with the db + pipeline injected (tested in
//     scripts/run-self-analysis.test.mjs with fakes).
//
// Tested in scripts/run-self-analysis.test.mjs.

export const BLOCKID_OWNER_EMAIL = "admin@blockid.au";
export const BLOCKID_NAME_PATTERN = "%blockid%";
/** "Blockid.au 1" — the project with the longest snapshot history (180 rows, 2026-09-20). Same constant as lib/showcase/blockid-report.ts. */
export const BLOCKID_CANONICAL_PROJECT_ID = "2bf55234-e359-4390-8faa-06597824f77a";
export const BLOCKID_STARTUP_NAME = "BlockID.au (Auschain PTY LTD)";
export const BLOCKID_SITE = "https://blockid.au";
export const BLOCKID_REPO = "https://github.com/Blockid-au/blockid";
export const BLOCKID_ABN = "79 659 615 111";
export const BLOCKID_ACN = "659 615 111";

/** Minimum text length for a criterion row to count as filled (computeQuality's "hasText" is > 50 chars). */
export const CRITERION_TEXT_MIN = 50;

/**
 * The founder-style description the SVI engine scores (raw_input). Facts only
 * — see the module header. "pre-revenue" is stated explicitly so the revenue
 * parser never reads a market figure as ARR (svi-analysis.ts deniesRevenue).
 */
export const BLOCKID_RAW_INPUT = `# BlockID.au — Startup Value Index (Auschain PTY LTD)

BlockID.au is the Startup Value Index: one live, evidence-weighted score across 8 dimensions that Australian evaluators (angel groups, accelerators, funds, accounting firms) screen on, and every founder gets feedback from. Entity: Auschain PTY LTD, ACN ${BLOCKID_ACN}, ABN ${BLOCKID_ABN}, Sydney NSW. Website: ${BLOCKID_SITE}. Source code: ${BLOCKID_REPO} (public repository, TypeScript).

Product: live SaaS platform (Next.js 16, self-hosted Supabase, DeepInfra-first AI routing) — a founder gets a free score, then an A$3 Trusted Business Report, then joins the index. Evaluator ladder: Scout A$79/mo, Firm A$149/mo, Program A$349/mo, Fund A$999/mo; Cohort 25 A$5,000/yr and Cohort 100 A$15,000/yr; billing live on Stripe with a customer portal. The report pipeline runs 8 dimension-owner agents plus a checker agent that flags unsupported claims, over a deterministic score ledger, an evidence ladder from 0.2 (self-declared) to 1.0 (third-party verified), a hash-chained event log and weekly re-snapshots. Proprietary data: 3,302 weekly snapshots across 182 startups form a unique dataset no chatbot has.

Traction: 182 startups analysed and 3,302 weekly SVI snapshots (capacity review 2026-09-13). We are pre-revenue: Stripe shows 0 active subscriptions and 5 one-off charges — the first A$3 report orders. Up to 5 accelerator pilots are in the pipeline for Sep–Nov 2026 (not signed). Programs: Founder Institute, Spacecubed AI Fellowship, NVIDIA Inception, Stripe for Startups. Analytics: GA4 connected with funnel events (sign_up, svi_analyze, report_view, checkout).

Market (Australia only, counted bottom-up): about 249 accelerators and incubators, 18 early-stage VC funds, 135 investor organisations, about 1,000 active angels and 4,345 accounting firms touching ESIC and R&D claims — roughly 5,700 organisations, a serviceable market of about A$12 million at list prices. Competitors: Crunchbase, PitchBook and Techboard (deal data), Affinity, Dealum and F6S (workflow CRMs), Equidam, desktop valuers at A$2,985–3,990 per report, and ChatGPT (static judgement).

Team: Do Van Long, founder and CEO, an experienced founder with 15 years in enterprise software — the method is grounded in his doctoral research (DBA) on startup valuation; he built and shipped the product solo with a C-suite of AI agents and a checker agent. Solo founder today: the commercial seat for evaluator sales (a second founder-level role) is an active search, not yet filled; no advisory board. Cap table: 10,000,000 shares authorised, founder 100 %, ESOP pool of 10–15 % reserved, 4-year vesting with a 1-year cliff. No shareholders agreement yet (single shareholder), no board cadence, financials not audited.

Raise: raising A$500K pre-seed at a pre-money of A$2.5M–A$4.0M on a SAFE with a A$3.5M cap and a 20 % discount; use of funds 50 % the commercial seat and engineering, 28 % evaluator go-to-market, 22 % trust and data; about 18 months of runway post-raise. Pitch deck v3 (12 slides) and a financial model with unit economics exist; the data room follows the 21-item checklist. ESIC-eligible early-stage innovation company; the R&D Tax Incentive has not been claimed so far, which is a live opportunity.

Legal and compliance: Terms of Service (${BLOCKID_SITE}/terms) and Privacy Policy (${BLOCKID_SITE}/privacy) live; a not-financial-advice disclaimer on every valuation surface; data-ownership principle "Your data belongs to your startup"; hash-chained event log; nightly database backups with a weekly restore drill. Proprietary IP: the SVI scoring method and the report pipeline.

Roadmap: G19 report quality (score ledger, honest valuation, evidence CTAs, BlockID's own report as the public showcase) shipping September 2026; G20 ready-for-sale sweep; 90-day evaluator go-to-market: 10/12/15 evaluator interviews, 2/6/8 LOIs, 2/4/5 pilots and 120/300/500 evaluator sign-ups at day 30/60/90.`;

/** The 13-criteria founder inputs (text + public links) — one row per CRITERION_KEYS entry. */
export const BLOCKID_CRITERIA = {
  idea: {
    text: "One live, evidence-weighted score (the Startup Value Index) that Australian evaluators screen startups on and founders get feedback from. Not a chatbot opinion: a fixed rubric, evidence weighted 0.2 → 1.0 by origin, an auditor agent, hash-chained events and a weekly re-score. The two-sided loop starts on the paying side (evaluators) and gives passed-on founders the reasons and a re-score path.",
    links: [{ url: `${BLOCKID_SITE}/methodology`, label: "Methodology" }, { url: `${BLOCKID_SITE}/product`, label: "Product" }],
  },
  market: {
    text: "Australia only, counted bottom-up: about 249 accelerators and incubators, 18 early-stage VC funds, 135 investor organisations, about 1,000 active angels and 4,345 accounting firms touching ESIC / R&D claims — roughly 5,700 organisations, a serviceable market of about A$12 million at list prices. Sydney Angels alone see about 40 applicants a cycle at 30–60 minutes each to read. Competitors: deal-data tools (Crunchbase, PitchBook US$15–20k/seat, Techboard), workflow CRMs (Affinity US$2–2.7k/seat, Dealum, F6S), desktop valuers (A$2,985–3,990 per report), Equidam and ChatGPT.",
    links: [{ url: `${BLOCKID_SITE}/solutions/investor`, label: "Investor solution" }],
  },
  founder_profile: {
    text: "Do Van Long — founder and CEO of Auschain PTY LTD. The scoring method is grounded in his doctoral research (DBA) on startup valuation; he built and shipped the product solo. Sydney-based. Programs: Founder Institute, Spacecubed AI Fellowship, NVIDIA Inception, Stripe for Startups.",
    links: [{ url: `${BLOCKID_SITE}/team`, label: "Team page" }],
  },
  code_git: {
    text: "Public repository (TypeScript, Next.js 16 App Router, self-hosted Supabase). Deploy gates: TypeScript, unit suite (vitest, ~37,000 tests), link check, live-QA smoke after every deploy, manifest / live-SHA verification. Weekly restore drill of the production database. No GitHub connector token is attached to this project yet — the repo audit runs from the public URL only.",
    links: [{ url: BLOCKID_REPO, label: "GitHub repository" }],
  },
  website: {
    text: "blockid.au is live: evaluator-first home, /product, /samples, /pricing, /methodology with the calibration backtest, /tbr/demo sample report, insights articles, VI mirror under /vi. Production link check runs weekly (525 pages, 0 broken on 2026-09-19); p95 latency marketing ~100 ms.",
    links: [{ url: BLOCKID_SITE, label: "Live site" }, { url: `${BLOCKID_SITE}/tbr/demo`, label: "Sample report" }],
  },
  team: {
    text: "Founder-only human team today. Engineering, finance, marketing, product, legal and security work is run through a C-suite of AI agents plus an auditor agent, each with a daily review routine. The one seat this raise fills first is a commercial co-founder for evaluator sales — an active search, not yet filled.",
    links: [],
  },
  customer_size: {
    text: "182 startups analysed and 3,302 weekly SVI snapshots (capacity audit 2026-09-13). 5 evaluator accounts, none paying yet. Pre-revenue: Stripe shows 0 active subscriptions and 5 one-off A$3 report charges. GA4 funnel events live: sign_up → svi_analyze → svi_score_computed → report_view → checkout.",
    links: [{ url: `${BLOCKID_SITE}/showcase/blockid`, label: "Public showcase" }],
  },
  gtm_strategy: {
    text: "Evaluator-first: A$3 report is the lead, programs are the revenue. Ladder: Free → A$3 Trusted Business Report → Scout A$79/mo → Firm A$149/mo → Program A$349/mo → Fund A$999/mo; Cohort 25 A$5,000/yr, Cohort 100 A$15,000/yr. 90-day plan: 10/12/15 evaluator interviews, 2/6/8 LOIs, 2/4/5 first paying programs on Cohort 25 / Cohort 100 (14-day trial, card required — the comped pilot was retired 2026-09-21), 120/300/500 evaluator sign-ups at day 30/60/90. Channels: accelerator intake links, angel groups, accounting firms (ESIC / R&D), the public index.",
    links: [{ url: `${BLOCKID_SITE}/pricing`, label: "Pricing" }, { url: `${BLOCKID_SITE}/solutions/accelerator`, label: "Programs" }],
  },
  documents: {
    text: "Pitch deck v3 (12 slides, evaluator-first, 3-minute cut) with a provenance table for every number; financial model with unit economics (base case month 12 is a projection, not a fact); PRD, architecture and API reference documents; investor feedback file (19 judge comments clustered C1–C10).",
    links: [{ url: `${BLOCKID_SITE}/pitch/svi-pitch-deck-v3-preview.html`, label: "Deck v3 preview" }],
  },
  dataroom: {
    text: "Data room follows the platform's 21-item checklist: company documents (ACN 659 615 111, ABN 79 659 615 111), cap table and ESOP pool, vesting schedule, pitch deck, financial model, product documentation, security posture and audit-chain reports. Not yet independently audited; no third-party financial statements.",
    links: [{ url: `${BLOCKID_SITE}/security-audit`, label: "Security posture" }],
  },
  team_structure: {
    text: "Single shareholder and director (founder 100 %); 10,000,000 shares authorised; ESOP pool 10–15 % reserved; 4-year vesting with a 1-year cliff on founder shares. No shareholders agreement yet (single holder), no board cadence, no advisory board. Governance and cap-table tooling are the product's own modules.",
    links: [],
  },
  roadmap: {
    text: "September 2026: G19 report quality (score ledger on every dimension, honest pre-revenue valuation, unassessed dimensions shown as pending with data CTAs, one synthesis on the dashboard, paid view = ReportV2, BlockID's own report as the public showcase) and G20 ready-for-sale sweep. Month 3: commercial co-founder hired, 5 pilots running, feedback letters live. Month 6: intake links live, 300 evaluator sign-ups. Month 12: 10 Programs, 3 Cohort 25, 2 Funds, 5 intake links, 500 evaluator sign-ups, backtest published.",
    links: [{ url: `${BLOCKID_SITE}/roadmap`, label: "Public roadmap" }, { url: `${BLOCKID_SITE}/changelog`, label: "Changelog" }],
  },
  revenue: {
    text: "Pre-revenue. Stripe (live mode) shows 0 active subscriptions and 5 one-off charges — the first A$3 Trusted Business Report orders; 0 MRR. Pricing is live for every tier (Scout A$79, Firm A$149, Program A$349, Fund A$999 per month; cohorts A$5,000–15,000 per year). Cost to produce a report is cents (DeepInfra-first routing), so gross margin on the A$3 report is high once volume exists — but no recurring revenue has been booked.",
    links: [{ url: `${BLOCKID_SITE}/pricing`, label: "Pricing" }],
  },
};

export const CRITERION_KEYS = Object.freeze(Object.keys(BLOCKID_CRITERIA));

/** Mirror of lib/evaluation-criteria.ts computeQuality (no ai_score here). */
export function qualityLevelFor({ text, files = [], links = [] }) {
  const hasText = String(text ?? "").trim().length > CRITERION_TEXT_MIN;
  const total = (hasText ? 1 : 0) + files.length + links.length;
  if (total >= 2 || (hasText && total >= 1)) return "good";
  if (total >= 1) return "basic";
  return "incomplete";
}

/**
 * Choose BlockID's canonical project among the owner's "%blockid%" rows:
 * `preferredId` when present in the list, else the most snapshots (ties →
 * oldest created). Returns null when the list is empty.
 */
export function pickCanonicalProject(rows, { preferredId = BLOCKID_CANONICAL_PROJECT_ID } = {}) {
  const list = (rows ?? []).filter((r) => r && typeof r.id === "string");
  if (list.length === 0) return null;
  const preferred = preferredId ? list.find((r) => r.id === preferredId) : null;
  if (preferred) return preferred;
  return [...list].sort((a, b) => (Number(b.snapshots ?? 0) - Number(a.snapshots ?? 0)) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0];
}

/** True when fewer than 13 criteria rows carry real text (> 50 chars). */
export function needsCriteriaSeed(existingRows) {
  const filled = new Set();
  for (const r of existingRows ?? []) {
    if (r && typeof r.criterion_key === "string" && String(r.text_input ?? "").trim().length > CRITERION_TEXT_MIN) filled.add(r.criterion_key);
  }
  return CRITERION_KEYS.some((k) => !filled.has(k));
}

/** The 13 evaluation_criteria upsert rows (onConflict account_id,criterion_key — the /api/evaluation shape). */
export function criteriaSeedRows({ accountId, projectId, now = new Date().toISOString(), dimensions = {} }) {
  return CRITERION_KEYS.map((key) => {
    const c = BLOCKID_CRITERIA[key];
    const links = c.links.map((l) => ({ url: l.url, label: l.label, verified_at: null }));
    const dims = dimensions[key] ?? {};
    return {
      account_id: accountId,
      project_id: projectId,
      criterion_key: key,
      text_input: c.text,
      files: [],
      links,
      quality_level: qualityLevelFor({ text: c.text, links }),
      primary_dimension: dims.primary ?? null,
      secondary_dimension: dims.secondary ?? null,
      updated_at: now,
    };
  });
}

/** The Supabase reads/writes runSelfReport needs (service role). */
export function makeSelfReportDb(sb, { ownerEmail = BLOCKID_OWNER_EMAIL, namePattern = BLOCKID_NAME_PATTERN } = {}) {
  return {
    async findOwnerUserId(email) {
      const { data } = await sb.from("app_users").select("id").eq("email", email).maybeSingle();
      return data?.id ?? null;
    },
    async listProjects() {
      const { data: owner } = await sb.from("app_users").select("id, email").eq("email", ownerEmail).maybeSingle();
      if (!owner) return [];
      const { data: projects, error } = await sb.from("projects").select("id, name, created_at, archived_at").eq("user_id", owner.id).ilike("name", namePattern).is("archived_at", null);
      if (error) throw new Error(`projects query failed: ${error.message}`);
      const rows = [];
      for (const p of projects ?? []) {
        const { count } = await sb.from("svi_snapshots").select("id", { count: "exact", head: true }).eq("project_id", p.id);
        rows.push({ id: p.id, name: p.name, created_at: p.created_at, snapshots: count ?? 0, owner_email: owner.email });
      }
      return rows;
    },
    async findAccount(projectId) {
      const { data } = await sb.from("svi_accounts").select("id, startup_name").eq("email", ownerEmail).eq("project_id", projectId).maybeSingle();
      return data ?? null;
    },
    async listCriteria(accountId) {
      const { data } = await sb.from("evaluation_criteria").select("criterion_key, text_input").eq("account_id", accountId);
      return data ?? [];
    },
    async upsertCriteria(rows) {
      const { error } = await sb.from("evaluation_criteria").upsert(rows, { onConflict: "account_id,criterion_key" });
      if (error) throw new Error(`evaluation_criteria upsert failed: ${error.message}`);
    },
  };
}

/**
 * G24-D: the `--audit-dump` document — every SectionAuditRecord the sweep
 * produced (sectionId, grounded, skipped, uncitedClaims, findings,
 * droppedFindings, llmAudited, hadIssues, the audited content) plus the
 * register ids / labels, so a grounding miss is diagnosable after the run.
 * `audit` is the orchestrator's `audit_complete.dump` (null when the pipeline
 * predates it — the document then says so instead of failing the run).
 */
export function buildAuditDumpDocument({ audit, run, project, tier, locale, quality = null, now = new Date().toISOString() }) {
  const sections = (audit?.sections ?? []).map((s) => ({
    sectionId: s.sectionId,
    grounded: Boolean(s.grounded),
    skipped: s.skipped ?? null,
    llmAudited: Boolean(s.llmAudited),
    hadIssues: Boolean(s.hadIssues),
    revised: Boolean(s.revised),
    uncitedClaims: s.uncitedClaims ?? [],
    findings: s.findings ?? [],
    droppedFindings: s.droppedFindings ?? [],
    allowedEvidenceIds: s.allowedEvidenceIds ?? [],
    content: s.content ?? "",
  }));
  const ungrounded = sections.filter((s) => !s.grounded).map((s) => ({
    sectionId: s.sectionId,
    why: s.uncitedClaims.length ? (s.hadIssues ? "uncited+critic" : "uncited") : s.hadIssues ? "critic" : "unknown",
    uncited: s.uncitedClaims.length,
    findings: s.findings.length,
  }));
  return {
    generatedAt: now,
    reportId: run?.reportId ?? null,
    snapshotId: run?.snapshotId ?? null,
    project: project ? { id: project.id, name: project.name } : null,
    tier,
    locale,
    groundedShare: audit?.groundedShare ?? quality?.groundedShare ?? null,
    quality,
    dumpAvailable: Boolean(audit),
    note: audit ? undefined : "the pipeline emitted no audit_complete.dump — pipeline predates G24-D",
    criticEvidenceChars: audit?.criticEvidenceChars ?? null,
    summary: {
      sections: sections.length,
      grounded: sections.filter((s) => s.grounded).length,
      llmAudited: sections.filter((s) => s.llmAudited).length,
      ungrounded,
    },
    sections,
    register: audit?.register ?? [],
  };
}

/**
 * Resolve → seed (when the criteria are empty or `forceSeed`) → re-score on
 * the seeded raw input → runTrustReportForProject(standard, en) → summary.
 *
 * `db`       : { listProjects(), findAccount(projectId), listCriteria(accountId),
 *               upsertCriteria(rows), findOwnerUserId(email) } — the script's
 *               Supabase wrapper, or a fake in tests.
 * `pipeline` : { runRescoreForProject, runTrustReportForProject, formatTbrQualityLine,
 *               criterionDimensions? } — tsx-loaded lib code, or fakes.
 */
export async function runSelfReport({ db, pipeline, log = () => {}, projectId = null, forceSeed = false, skipSeed = false, dryRun = false, tier = "standard", locale = "en", auditDump = null }) {
  const rows = await db.listProjects();
  const project = pickCanonicalProject(rows, { preferredId: projectId ?? BLOCKID_CANONICAL_PROJECT_ID });
  if (!project) throw new Error(`no "${BLOCKID_NAME_PATTERN}" project owned by ${BLOCKID_OWNER_EMAIL}`);
  if (projectId && project.id !== projectId) throw new Error(`project ${projectId} is not one of ${BLOCKID_OWNER_EMAIL}'s blockid projects`);
  log(`project: ${project.id} "${project.name}" (${project.snapshots ?? "?"} snapshots, owner ${project.owner_email ?? BLOCKID_OWNER_EMAIL})`);

  const ownerUserId = await db.findOwnerUserId(project.owner_email ?? BLOCKID_OWNER_EMAIL);
  if (!ownerUserId) throw new Error(`app_users row for ${BLOCKID_OWNER_EMAIL} not found`);

  const seeded = { criteria: 0, rescored: false, analysisId: null, rescoreSnapshotId: null };
  if (dryRun) {
    const account = await db.findAccount(project.id);
    const existing = account ? await db.listCriteria(account.id) : [];
    const wouldSeed = Boolean(account) && !skipSeed && (forceSeed || needsCriteriaSeed(existing));
    log(`dry run: account ${account?.id ?? "(none)"} · criteria filled ${existing.filter((r) => String(r.text_input ?? "").trim().length > CRITERION_TEXT_MIN).length}/13 · would seed: ${wouldSeed} · would run tier=${tier} locale=${locale}`);
    return { dryRun: true, project: { id: project.id, name: project.name, snapshots: project.snapshots ?? null }, ownerUserId, wouldSeed, accountId: account?.id ?? null };
  }
  if (!skipSeed) {
    const account = await db.findAccount(project.id);
    const existing = account ? await db.listCriteria(account.id) : [];
    if (account && (forceSeed || needsCriteriaSeed(existing))) {
      const seedRows = criteriaSeedRows({ accountId: account.id, projectId: project.id, dimensions: pipeline.criterionDimensions ?? {} });
      await db.upsertCriteria(seedRows);
      seeded.criteria = seedRows.length;
      log(`seeded ${seedRows.length} criteria rows on account ${account.id}`);
      const rescore = await pipeline.runRescoreForProject({ projectId: project.id, requestedByUserId: ownerUserId, rawInput: BLOCKID_RAW_INPUT });
      seeded.rescored = true;
      seeded.analysisId = rescore.analysisId ?? null;
      seeded.rescoreSnapshotId = rescore.snapshotId ?? null;
      log(`re-scored on the seeded input: analysis ${rescore.analysisId} svi ${rescore.svi} stage ${rescore.stage}`);
    } else {
      log(account ? "criteria already filled — no seed" : "no svi_accounts row for the project — pipeline will create one; no criteria seed");
    }
  }

  const t0 = Date.now();
  // G24-D: the grounding sweep's per-section audit (audit_complete.dump) — written by `auditDump.write(path, json)` when the caller asked for it.
  let audit = null;
  const onEvent = (event) => {
    const at = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    if (event.type === "audit_complete" && event.dump) audit = event.dump;
    switch (event.type) {
      case "context": log(`[${at}] context: stage ${event.stage} ${event.stageLabel} · phase ${event.phaseId} · est. ${event.estimatedCalls} calls / ${event.estimatedSeconds}s`); break;
      case "gather_complete": log(`[${at}] gather: ${event.evidenceRows} evidence rows · connectors ${event.connectors.join(",") || "none"}${event.diagnostics ? " · " + Object.entries(event.diagnostics).map(([k, v]) => `${k}=${v.status}/${v.ms}ms`).join(" ") : ""}`); break;
      case "dimension_complete": log(`[${at}] chapter ${event.dim}: score ${event.chapter?.score ?? "?"} band ${event.chapter?.band ?? "?"}${event.chapter?.degraded ? " (degraded)" : ""}`); break;
      case "audit_complete": log(`[${at}] audit: grounded ${event.groundedShare} · revised ${event.revised}`); break;
      case "progress": log(`[${at}] ${event.phase} ${event.completed}/${event.total}`); break;
      case "error": log(`[${at}] error${event.dim ? ` (${event.dim})` : ""}: ${event.message}`); break;
      case "done": log(`[${at}] done: ${event.calls} calls · US$${event.costUsd.toFixed(4)} · degraded ${event.degradedSections.length} · deadline hit ${event.deadlineHit}`); break;
      default: break;
    }
  };
  const run = await pipeline.runTrustReportForProject({ projectId: project.id, requestedByUserId: ownerUserId, tier, locale, creditsCost: 0, onEvent });
  const qualityLine = pipeline.formatTbrQualityLine ? pipeline.formatTbrQualityLine(run.quality) : JSON.stringify(run.quality);
  log(`report ${run.reportId} → snapshot ${run.snapshotId ?? "(none)"} share ${run.shareToken ? "minted" : "none"} svi ${run.svi} stage ${run.stage} words ${run.wordCount} quality ${run.qualityScore}`);
  log(qualityLine);
  let auditDumpPath = null;
  if (auditDump?.path && auditDump.write) {
    const doc = buildAuditDumpDocument({ audit, run, project, tier, locale, quality: run.quality });
    await auditDump.write(auditDump.path, JSON.stringify(doc, null, 2));
    auditDumpPath = auditDump.path;
    log(`audit dump: ${auditDump.path} (${doc.sections.length} sections, ${doc.summary.ungrounded.length} ungrounded)`);
  }
  return {
    project: { id: project.id, name: project.name, snapshots: project.snapshots ?? null },
    ownerUserId,
    seeded,
    reportId: run.reportId,
    auditDumpPath,
    snapshotId: run.snapshotId ?? null,
    shareToken: run.shareToken ?? null,
    svi: run.svi,
    stage: run.stage,
    wordCount: run.wordCount,
    qualityScore: run.qualityScore,
    quality: run.quality,
    qualityLine,
    reportV2Persisted: Boolean(run.reportV2),
    showcaseUrl: `${BLOCKID_SITE}/showcase/blockid/report`,
  };
}
