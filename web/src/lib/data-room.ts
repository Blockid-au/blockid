import "server-only";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Data Room Generator — Phase 6: Investment & Fundraise
//
// Compiles a structured, investor-ready data room from existing user data
// spread across multiple Supabase tables. Each section scores completeness
// to show gaps and guide the founder on what to add.
// ---------------------------------------------------------------------------

export interface DataRoomSection {
  id: string;
  title: string;
  items: DataRoomItem[];
  completeness: number; // 0-100%
}

export interface DataRoomItem {
  label: string;
  status: "complete" | "missing" | "partial";
  source: "auto" | "manual" | "evidence";
  value?: string;
  link?: string;
}

export interface DataRoom {
  sections: DataRoomSection[];
  overallCompleteness: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// generateDataRoom — build 6 sections from available data
// ---------------------------------------------------------------------------

export function generateDataRoom(params: {
  user: { email: string; displayName: string | null };
  sviAccount: {
    startupName: string | null;
    currentStage: number;
    currentSvi: number;
  } | null;
  latestAnalysis?: {
    totalSvi: number;
    analysisJson: unknown;
  } | null;
  metrics?: Array<{ metricType: string; value: number }> | null;
  capTable?: {
    shareholders: Array<{ name: string; role: string; shares_held: number }>;
  } | null;
  evidence?: Array<{
    evidenceType: string;
    label: string;
    valueOrUrl: string;
    dimension?: string;
  }> | null;
  valuation?: {
    low: number;
    mid: number;
    high: number;
  } | null;
}): DataRoom {
  const sections: DataRoomSection[] = [];

  // ── Section 1: Company Overview ───────────────────────────────────────
  const companyItems: DataRoomItem[] = [];

  companyItems.push({
    label: "Startup Name",
    status: params.sviAccount?.startupName ? "complete" : "missing",
    source: "auto",
    value: params.sviAccount?.startupName ?? undefined,
  });

  companyItems.push({
    label: "Founder / Contact",
    status: params.user.displayName || params.user.email ? "complete" : "missing",
    source: "auto",
    value: params.user.displayName ?? params.user.email,
  });

  companyItems.push({
    label: "Current Stage",
    status: params.sviAccount ? "complete" : "missing",
    source: "auto",
    value: params.sviAccount
      ? stageLabel(params.sviAccount.currentStage)
      : undefined,
  });

  companyItems.push({
    label: "SVI Score",
    status: params.sviAccount && params.sviAccount.currentSvi > 0
      ? "complete"
      : "missing",
    source: "auto",
    value: params.sviAccount
      ? `${params.sviAccount.currentSvi}/1000`
      : undefined,
  });

  const abnEvidence = findEvidence(params.evidence, ["abn", "australian business number"]);
  companyItems.push({
    label: "ABN / Company Registration",
    status: abnEvidence ? "complete" : "missing",
    source: abnEvidence ? "evidence" : "manual",
    value: abnEvidence?.valueOrUrl,
  });

  sections.push(buildSection("company", "Company Overview", companyItems));

  // ── Section 2: Product & Technology ───────────────────────────────────
  const productItems: DataRoomItem[] = [];

  const hasAnalysis = !!params.latestAnalysis;
  productItems.push({
    label: "SVI Analysis Report",
    status: hasAnalysis ? "complete" : "missing",
    source: "auto",
    value: hasAnalysis
      ? `Score: ${params.latestAnalysis!.totalSvi}/1000`
      : undefined,
  });

  const productEvidence = findEvidence(params.evidence, [
    "product", "demo", "screenshot", "prototype", "mvp",
  ]);
  productItems.push({
    label: "Product Demo / Screenshots",
    status: productEvidence ? "complete" : "missing",
    source: productEvidence ? "evidence" : "manual",
    value: productEvidence?.label,
  });

  const techEvidence = findEvidence(params.evidence, [
    "technical", "architecture", "tech stack", "infrastructure",
  ]);
  productItems.push({
    label: "Technical Architecture",
    status: techEvidence ? "complete" : "missing",
    source: techEvidence ? "evidence" : "manual",
    value: techEvidence?.label,
  });

  const ipEvidence = findEvidence(params.evidence, [
    "ip", "intellectual property", "patent", "trademark",
  ]);
  productItems.push({
    label: "IP / Patent Documentation",
    status: ipEvidence ? "complete" : "missing",
    source: ipEvidence ? "evidence" : "manual",
    value: ipEvidence?.label,
  });

  sections.push(buildSection("product", "Product & Technology", productItems));

  // ── Section 3: Financial ─────────────────────────────────────────────
  const financialItems: DataRoomItem[] = [];

  const hasMetrics = params.metrics && params.metrics.length > 0;
  const findMetric = (type: string) =>
    params.metrics?.find((m) => m.metricType === type);

  const mrr = findMetric("mrr");
  financialItems.push({
    label: "Monthly Recurring Revenue (MRR)",
    status: mrr ? "complete" : "missing",
    source: "auto",
    value: mrr ? `A$${mrr.value.toLocaleString("en-AU")}` : undefined,
  });

  const arr = findMetric("arr");
  financialItems.push({
    label: "Annual Recurring Revenue (ARR)",
    status: arr ? "complete" : "missing",
    source: "auto",
    value: arr ? `A$${arr.value.toLocaleString("en-AU")}` : undefined,
  });

  const burnRate = findMetric("burn_rate");
  financialItems.push({
    label: "Monthly Burn Rate",
    status: burnRate ? "complete" : "missing",
    source: "auto",
    value: burnRate
      ? `A$${burnRate.value.toLocaleString("en-AU")}/mo`
      : undefined,
  });

  const runway = findMetric("runway");
  financialItems.push({
    label: "Runway (months)",
    status: runway ? "complete" : "missing",
    source: "auto",
    value: runway ? `${runway.value} months` : undefined,
  });

  financialItems.push({
    label: "Valuation Estimate",
    status: params.valuation ? "complete" : "missing",
    source: "auto",
    value: params.valuation
      ? `A$${Math.round(params.valuation.mid).toLocaleString("en-AU")}`
      : undefined,
  });

  const financialEvidence = findEvidence(params.evidence, [
    "p&l", "profit", "loss", "financial", "bank statement", "cashflow",
  ]);
  financialItems.push({
    label: "P&L / Financial Statements",
    status: financialEvidence ? "complete" : "missing",
    source: financialEvidence ? "evidence" : "manual",
    value: financialEvidence?.label,
  });

  sections.push(buildSection("financial", "Financial", financialItems));

  // ── Section 4: Market & Traction ─────────────────────────────────────
  const marketItems: DataRoomItem[] = [];

  const pitchEvidence = findEvidence(params.evidence, [
    "pitch", "deck", "presentation",
  ]);
  marketItems.push({
    label: "Pitch Deck",
    status: pitchEvidence ? "complete" : "missing",
    source: pitchEvidence ? "evidence" : "manual",
    value: pitchEvidence?.label,
  });

  const marketEvidence = findEvidence(params.evidence, [
    "market", "tam", "sam", "research", "competitive",
  ]);
  marketItems.push({
    label: "Market Research / TAM Analysis",
    status: marketEvidence ? "complete" : "missing",
    source: marketEvidence ? "evidence" : "manual",
    value: marketEvidence?.label,
  });

  const customerEvidence = findEvidence(params.evidence, [
    "customer", "contract", "loi", "letter of intent", "testimonial",
  ]);
  marketItems.push({
    label: "Customer Contracts / LOIs",
    status: customerEvidence ? "complete" : "missing",
    source: customerEvidence ? "evidence" : "manual",
    value: customerEvidence?.label,
  });

  const growthMetric = findMetric("revenue_growth");
  marketItems.push({
    label: "Revenue Growth Rate",
    status: growthMetric ? "complete" : "missing",
    source: "auto",
    value: growthMetric ? `${growthMetric.value}% MoM` : undefined,
  });

  sections.push(buildSection("market", "Market & Traction", marketItems));

  // ── Section 5: Team & Cap Table ──────────────────────────────────────
  const teamItems: DataRoomItem[] = [];

  const hasShareholders =
    params.capTable && params.capTable.shareholders.length > 0;
  teamItems.push({
    label: "Cap Table",
    status: hasShareholders ? "complete" : "missing",
    source: "auto",
    value: hasShareholders
      ? `${params.capTable!.shareholders.length} shareholders`
      : undefined,
  });

  // List founders from cap table
  const founders =
    params.capTable?.shareholders.filter(
      (s) =>
        s.role === "founder" || s.role === "co-founder" || s.role === "ceo",
    ) ?? [];
  teamItems.push({
    label: "Founder Profiles",
    status: founders.length > 0 ? "complete" : "missing",
    source: "auto",
    value:
      founders.length > 0
        ? founders.map((f) => f.name).join(", ")
        : undefined,
  });

  const shaEvidence = findEvidence(params.evidence, [
    "shareholders agreement", "sha", "shareholder",
  ]);
  teamItems.push({
    label: "Shareholders Agreement",
    status: shaEvidence ? "complete" : "missing",
    source: shaEvidence ? "evidence" : "manual",
    value: shaEvidence?.label,
  });

  const vestingEvidence = findEvidence(params.evidence, [
    "vesting", "esop", "option",
  ]);
  teamItems.push({
    label: "Vesting Schedules / ESOP",
    status: vestingEvidence ? "complete" : "missing",
    source: vestingEvidence ? "evidence" : "manual",
    value: vestingEvidence?.label,
  });

  sections.push(buildSection("team", "Team & Cap Table", teamItems));

  // ── Section 6: Legal & Compliance ────────────────────────────────────
  const legalItems: DataRoomItem[] = [];

  const constitutionEvidence = findEvidence(params.evidence, [
    "constitution", "company constitution", "cert", "incorporation",
  ]);
  legalItems.push({
    label: "Certificate of Incorporation / Constitution",
    status: constitutionEvidence ? "complete" : "missing",
    source: constitutionEvidence ? "evidence" : "manual",
    value: constitutionEvidence?.label,
  });

  const tosEvidence = findEvidence(params.evidence, [
    "terms of service", "tos", "eula",
  ]);
  legalItems.push({
    label: "Terms of Service",
    status: tosEvidence ? "complete" : "missing",
    source: tosEvidence ? "evidence" : "manual",
    value: tosEvidence?.label,
  });

  const privacyEvidence = findEvidence(params.evidence, [
    "privacy", "privacy policy",
  ]);
  legalItems.push({
    label: "Privacy Policy",
    status: privacyEvidence ? "complete" : "missing",
    source: privacyEvidence ? "evidence" : "manual",
    value: privacyEvidence?.label,
  });

  const contractEvidence = findEvidence(params.evidence, [
    "contract", "supplier", "partner", "agreement",
  ]);
  legalItems.push({
    label: "Key Contracts",
    status: contractEvidence ? "complete" : "missing",
    source: contractEvidence ? "evidence" : "manual",
    value: contractEvidence?.label,
  });

  sections.push(buildSection("legal", "Legal & Compliance", legalItems));

  // ── Overall completeness ─────────────────────────────────────────────
  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const completeItems = sections.reduce(
    (n, s) => n + s.items.filter((i) => i.status === "complete").length,
    0,
  );
  const overallCompleteness =
    totalItems > 0 ? Math.round((completeItems / totalItems) * 100) : 0;

  return {
    sections,
    overallCompleteness,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSection(
  id: string,
  title: string,
  items: DataRoomItem[],
): DataRoomSection {
  const complete = items.filter((i) => i.status === "complete").length;
  const completeness =
    items.length > 0 ? Math.round((complete / items.length) * 100) : 0;
  return { id, title, items, completeness };
}

function findEvidence(
  evidence:
    | Array<{
        evidenceType: string;
        label: string;
        valueOrUrl: string;
        dimension?: string;
      }>
    | null
    | undefined,
  keywords: string[],
) {
  if (!evidence || evidence.length === 0) return null;
  return evidence.find((e) => {
    const text = `${e.label} ${e.evidenceType}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }) ?? null;
}

function stageLabel(stage: number): string {
  const labels: Record<number, string> = {
    0: "Idea",
    1: "Validation",
    2: "MVP",
    3: "Launch",
    4: "Revenue",
    5: "Growth",
    6: "Scale",
    7: "Exit-Ready",
  };
  return labels[stage] ?? `Stage ${stage}`;
}

// ---------------------------------------------------------------------------
// Investor share links
//
// A data room is reachable by an investor ONLY through a token the founder
// explicitly minted. There is no "public" flag consulted anywhere on the read
// path — migration 0125 cleared `data_rooms.is_public` for exactly that reason.
// The token IS the credential, so it must be unguessable and revocable.
// ---------------------------------------------------------------------------

/** 24 random bytes → 32 base64url chars ≈ 192 bits. Not enumerable. */
export function mintShareToken(): string {
  // Lazy require keeps this module importable from the pure-function tests
  // without dragging node:crypto into a browser bundle.
  return randomBytes(24).toString("base64url");
}

export interface ShareLinkRow {
  is_active?: boolean | null;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export type ShareLinkState = "active" | "revoked" | "expired";

/**
 * Why a share link will not resolve. Callers 404 on anything but "active" —
 * never distinguish "revoked" from "no such token" to the holder of a bad
 * token, or the endpoint becomes a token oracle.
 */
export function shareLinkState(
  link: ShareLinkRow,
  now: Date = new Date(),
): ShareLinkState {
  if (link.revoked_at) return "revoked";
  if (link.is_active === false) return "revoked";
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** Clamp a caller-supplied expiry window to something sane. */
export function resolveExpiry(
  expiresInDays: unknown,
  now: Date = new Date(),
): string | null {
  if (expiresInDays === null) return null;
  const raw = typeof expiresInDays === "number" ? expiresInDays : DEFAULT_SHARE_DAYS;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const days = Math.min(Math.floor(raw), MAX_SHARE_DAYS);
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export const DEFAULT_SHARE_DAYS = 30;
export const MAX_SHARE_DAYS = 365;

// ---------------------------------------------------------------------------
// Generated document composition
//
// "Auto data room" used to mean 34 rows with status='complete', no file and no
// content behind any of them. An investor opening that sees a full checklist
// and empty files, which is strictly worse than an honest gap list. So:
//
//   - documents the platform can genuinely write from data it already holds
//     get real prose in `template_content` and status 'complete';
//   - documents only a human/third party can produce (signed SHA, ASIC
//     certificate, audited accounts) are marked 'missing' with a concrete
//     "what to upload" prompt — never 'complete';
//   - where the founder has logged evidence but not the source document, the
//     row is 'pending' and says which evidence was matched.
// ---------------------------------------------------------------------------

export interface GeneratedDocument {
  section: string;
  folder: string;
  documentName: string;
  documentType: "auto" | "upload";
  status: "complete" | "missing" | "pending";
  priority: "P0" | "P1" | "P2";
  templateContent: string | null;
  notes: string | null;
}

type ComposeParams = Parameters<typeof generateDataRoom>[0];

export function composeRoomDocuments(params: ComposeParams): GeneratedDocument[] {
  const docs: GeneratedDocument[] = [];
  const name = params.sviAccount?.startupName?.trim() || "This startup";
  const stage = params.sviAccount ? stageLabel(params.sviAccount.currentStage) : null;
  const findMetric = (t: string) => params.metrics?.find((m) => m.metricType === t);

  // ── Company summary — always producible if we know who they are ────────
  if (params.sviAccount) {
    const lines = [
      `# ${name} — Company Summary`,
      "",
      `Prepared by BlockID from the founder's own workspace data on ${today()}.`,
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Startup | ${name} |`,
      `| Stage | ${stage} |`,
      `| SVI score | ${params.sviAccount.currentSvi}/1000 |`,
      `| Founder contact | ${params.user.displayName ?? params.user.email} |`,
    ];
    const abn = findEvidence(params.evidence, ["abn", "australian business number"]);
    lines.push(`| ABN | ${abn ? abn.valueOrUrl : "not on file"} |`);
    lines.push("", "## What this room contains", "");
    lines.push(
      "Every figure below is generated from the founder's live BlockID workspace — the SVI assessment, the cap table register, and the metrics the founder maintains. Nothing here is a placeholder. Documents that BlockID cannot produce (signed agreements, ASIC certificates, accountant-prepared statements) are listed as missing rather than dressed up as complete.",
    );
    docs.push({
      section: "corporate",
      folder: "1. Corporate & Legal",
      documentName: "Company Summary",
      documentType: "auto",
      status: "complete",
      priority: "P0",
      templateContent: lines.join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "corporate",
      folder: "1. Corporate & Legal",
      documentName: "Company Summary",
      priority: "P0",
      notes: "Run an SVI assessment so BlockID can write the company summary from your own data.",
      documentType: "auto",
    }));
  }

  // ── SVI breakdown ──────────────────────────────────────────────────────
  const dims = dimensionRows(params.latestAnalysis?.analysisJson);
  if (params.sviAccount && (dims.length > 0 || params.latestAnalysis)) {
    const total = params.latestAnalysis?.totalSvi ?? params.sviAccount.currentSvi;
    const lines = [
      `# SVI Breakdown — ${name}`,
      "",
      `**Total SVI: ${total}/1000** · Stage: ${stage} · Generated ${today()}`,
      "",
      "The Startup Value Index scores eight dimensions of company readiness. An",
      "investor should read the low scores as the diligence agenda.",
      "",
    ];
    if (dims.length > 0) {
      lines.push("| Dimension | Score |", "| --- | --- |");
      for (const d of dims) lines.push(`| ${d.label} | ${d.value} |`);
      const weakest = [...dims].sort((a, b) => a.value - b.value).slice(0, 3);
      lines.push("", "## Weakest dimensions", "");
      for (const w of weakest) {
        lines.push(`- **${w.label}** (${w.value}) — expect diligence questions here.`);
      }
    } else {
      lines.push(
        "Dimension-level scores are not yet published for this assessment; only the headline index is available.",
      );
    }
    docs.push({
      section: "strategy",
      folder: "9. Strategy & Roadmap",
      documentName: "SVI Score Breakdown",
      documentType: "auto",
      status: "complete",
      priority: "P0",
      templateContent: lines.join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "strategy",
      folder: "9. Strategy & Roadmap",
      documentName: "SVI Score Breakdown",
      priority: "P0",
      notes: "No SVI analysis on file. Complete an assessment to publish the eight-dimension breakdown.",
      documentType: "auto",
    }));
  }

  // ── Valuation summary ──────────────────────────────────────────────────
  if (params.valuation) {
    const v = params.valuation;
    docs.push({
      section: "financial",
      folder: "3. Financial Projections",
      documentName: "Valuation Summary",
      documentType: "auto",
      status: "complete",
      priority: "P0",
      templateContent: [
        `# Valuation Summary — ${name}`,
        "",
        `Generated ${today()} from the SVI score, stage and the founder's reported metrics.`,
        "",
        "| Band | Pre-money (AUD) |",
        "| --- | --- |",
        `| Low | ${aud(v.low)} |`,
        `| Mid | ${aud(v.mid)} |`,
        `| High | ${aud(v.high)} |`,
        "",
        "## How to read this",
        "",
        "This is an indicative BlockID model output, not a valuation opinion, not",
        "financial product advice, and not a substitute for an independent",
        "valuation. It is stage- and score-weighted, so it moves when the",
        "underlying SVI and metrics move.",
      ].join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "financial",
      folder: "3. Financial Projections",
      documentName: "Valuation Summary",
      priority: "P0",
      notes: "Valuation needs an SVI score and a stage. Complete the assessment, then regenerate.",
      documentType: "auto",
    }));
  }

  // ── Cap table summary ──────────────────────────────────────────────────
  const holders = params.capTable?.shareholders ?? [];
  if (holders.length > 0) {
    const total = holders.reduce((n, h) => n + Number(h.shares_held || 0), 0);
    const lines = [
      `# Cap Table Summary — ${name}`,
      "",
      `${holders.length} shareholder${holders.length === 1 ? "" : "s"} on the register · ${total.toLocaleString("en-AU")} shares issued · generated ${today()}`,
      "",
      "| Holder | Role | Shares | Issued % |",
      "| --- | --- | --- | --- |",
    ];
    for (const h of holders) {
      const pct = total > 0 ? ((Number(h.shares_held) / total) * 100).toFixed(2) : "0.00";
      lines.push(
        `| ${h.name} | ${h.role ?? "—"} | ${Number(h.shares_held).toLocaleString("en-AU")} | ${pct}% |`,
      );
    }
    lines.push(
      "",
      "Percentages are of issued shares on the register maintained in BlockID. They",
      "are not fully-diluted: any unissued option pool, SAFE or convertible note is",
      "not modelled here and should be requested separately.",
    );
    docs.push({
      section: "captable",
      folder: "2. Cap Table & Equity",
      documentName: "Cap Table Summary",
      documentType: "auto",
      status: "complete",
      priority: "P0",
      templateContent: lines.join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "captable",
      folder: "2. Cap Table & Equity",
      documentName: "Cap Table Summary",
      priority: "P0",
      notes: "No shareholders on the register. Add them in Workspace → Cap table, then regenerate the room.",
      documentType: "auto",
    }));
  }

  // ── Traction summary ───────────────────────────────────────────────────
  const traction: Array<[string, string]> = [];
  const mrr = findMetric("mrr");
  if (mrr) traction.push(["MRR", aud(mrr.value)]);
  const arr = findMetric("arr");
  if (arr) traction.push(["ARR", aud(arr.value)]);
  const growth = findMetric("revenue_growth");
  if (growth) traction.push(["Revenue growth", `${growth.value}% MoM`]);
  const burn = findMetric("burn_rate");
  if (burn) traction.push(["Monthly burn", aud(burn.value)]);
  const runway = findMetric("runway");
  if (runway) traction.push(["Runway", `${runway.value} months`]);

  if (traction.length > 0) {
    docs.push({
      section: "traction",
      folder: "5. Market & Traction",
      documentName: "Traction & Metrics Summary",
      documentType: "auto",
      status: "complete",
      priority: "P0",
      templateContent: [
        `# Traction & Metrics — ${name}`,
        "",
        `Founder-reported, as at ${today()}. Not accountant-verified — ask for the`,
        "bank feed or accountant-prepared statements before relying on them.",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        ...traction.map(([k, v]) => `| ${k} | ${v} |`),
      ].join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "traction",
      folder: "5. Market & Traction",
      documentName: "Traction & Metrics Summary",
      priority: "P0",
      notes: "No metrics recorded. Add MRR/ARR, burn and runway in Workspace → Metrics, then regenerate.",
      documentType: "auto",
    }));
  }

  // ── Evidence index ─────────────────────────────────────────────────────
  const evidence = params.evidence ?? [];
  if (evidence.length > 0) {
    docs.push({
      section: "references",
      folder: "10. References & Due Diligence",
      documentName: "Evidence Index",
      documentType: "auto",
      status: "complete",
      priority: "P1",
      templateContent: [
        `# Evidence Index — ${name}`,
        "",
        `${evidence.length} item${evidence.length === 1 ? "" : "s"} logged against the SVI assessment, generated ${today()}.`,
        "",
        "| Evidence | Type | Dimension |",
        "| --- | --- | --- |",
        ...evidence
          .slice(0, 100)
          .map((e) => `| ${e.label} | ${e.evidenceType} | ${e.dimension ?? "—"} |`),
      ].join("\n"),
      notes: null,
    });
  } else {
    docs.push(missing({
      section: "references",
      folder: "10. References & Due Diligence",
      documentName: "Evidence Index",
      priority: "P1",
      notes: "No evidence logged yet. Each SVI claim backed by evidence is one fewer question in diligence.",
      documentType: "auto",
    }));
  }

  // ── Documents BlockID cannot produce — honest gaps ─────────────────────
  for (const spec of UPLOAD_ONLY_DOCUMENTS) {
    const hit = findEvidence(params.evidence, spec.keywords);
    docs.push({
      section: spec.section,
      folder: spec.folder,
      documentName: spec.documentName,
      documentType: "upload",
      // Evidence logged but no file attached is genuinely partial — say so
      // rather than claiming the document is in the room.
      status: hit ? "pending" : "missing",
      priority: spec.priority,
      templateContent: null,
      notes: hit
        ? `Evidence on file ("${hit.label}") but the source document is not attached. Upload it to complete this item.`
        : spec.notes,
    });
  }

  return docs;
}

interface UploadOnlySpec {
  section: string;
  folder: string;
  documentName: string;
  priority: "P0" | "P1" | "P2";
  keywords: string[];
  notes: string;
}

/**
 * Documents that require a signature, a regulator or a third party. BlockID
 * cannot write any of these from workspace data, so it never claims to.
 */
export const UPLOAD_ONLY_DOCUMENTS: readonly UploadOnlySpec[] = Object.freeze([
  {
    section: "corporate",
    folder: "1. Corporate & Legal",
    documentName: "ASIC Company Extract",
    priority: "P0",
    keywords: ["asic", "company extract", "incorporation", "certificate of registration"],
    notes: "Upload a current ASIC company extract (PDF). Investors expect one less than 30 days old during an active raise.",
  },
  {
    section: "corporate",
    folder: "1. Corporate & Legal",
    documentName: "Company Constitution",
    priority: "P0",
    keywords: ["constitution", "replaceable rules"],
    notes: "Upload the executed constitution, or state in writing that the company adopts the replaceable rules.",
  },
  {
    section: "captable",
    folder: "2. Cap Table & Equity",
    documentName: "Shareholders Agreement (executed)",
    priority: "P0",
    keywords: ["shareholders agreement", "sha"],
    notes: "Upload the signed shareholders agreement. BlockID can summarise your register but cannot produce an executed agreement.",
  },
  {
    section: "financial",
    folder: "3. Financial Projections",
    documentName: "Accountant-prepared Financial Statements",
    priority: "P0",
    keywords: ["financial statement", "p&l", "profit and loss", "audited", "balance sheet"],
    notes: "Upload the most recent accountant-prepared or audited statements. Founder-reported metrics are not a substitute.",
  },
  {
    section: "traction",
    folder: "5. Market & Traction",
    documentName: "Pitch Deck",
    priority: "P0",
    keywords: ["pitch", "deck", "presentation"],
    notes: "Upload the current investor deck (PDF). This is the first document most investors open.",
  },
  {
    section: "team",
    folder: "6. Team & Advisors",
    documentName: "Founder Employment / IP Assignment Deeds",
    priority: "P0",
    keywords: ["employment", "ip assignment", "deed"],
    notes: "Upload signed founder agreements assigning IP to the company. Unassigned founder IP is a common deal-breaker.",
  },
  {
    section: "ip",
    folder: "7. IP & Compliance",
    documentName: "IP Register / Trade Mark Certificates",
    priority: "P1",
    keywords: ["trademark", "trade mark", "patent", "intellectual property", "ip register"],
    notes: "Upload IP Australia records for any registered marks or patents, or note that none are registered.",
  },
  {
    section: "contracts",
    folder: "8. Contracts & Agreements",
    documentName: "Customer Contracts / LOIs",
    priority: "P0",
    keywords: ["customer", "contract", "loi", "letter of intent", "purchase order"],
    notes: "Upload signed customer contracts or letters of intent. Revenue claims without contracts stall diligence.",
  },
]);

function missing(spec: {
  section: string;
  folder: string;
  documentName: string;
  priority: "P0" | "P1" | "P2";
  notes: string;
  documentType: "auto" | "upload";
}): GeneratedDocument {
  return {
    section: spec.section,
    folder: spec.folder,
    documentName: spec.documentName,
    documentType: spec.documentType,
    status: "missing",
    priority: spec.priority,
    templateContent: null,
    notes: spec.notes,
  };
}

/** Completeness that counts content, not status flags. */
export function documentCompleteness(docs: GeneratedDocument[]): number {
  if (docs.length === 0) return 0;
  const done = docs.filter((d) => d.status === "complete").length;
  return Math.round((done / docs.length) * 100);
}

function aud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder-Team Value (FTV)",
  mpc: "Market Pull & Customers (MPC)",
  ptd: "Product & Tech Depth (PTD)",
  tre: "Traction & Revenue Engine (TRE)",
  cgh: "Capital & Governance Hygiene (CGH)",
  iri: "IP & Regulatory Integrity (IRI)",
  lco: "Learning & Cadence of Ops (LCO)",
  svm: "Strategic Value Multiplier (SVM)",
};

function dimensionRows(
  analysisJson: unknown,
): Array<{ label: string; value: number }> {
  if (!analysisJson || typeof analysisJson !== "object") return [];
  const root = analysisJson as Record<string, unknown>;
  const source =
    (root.dimensions as Record<string, unknown> | undefined) ??
    (root.dimension_scores as Record<string, unknown> | undefined) ??
    root;
  if (!source || typeof source !== "object") return [];
  const rows: Array<{ label: string; value: number }> = [];
  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const raw = (source as Record<string, unknown>)[key];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value)) rows.push({ label, value });
  }
  return rows;
}
