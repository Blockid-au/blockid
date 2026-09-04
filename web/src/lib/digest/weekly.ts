// Wave 28A — Founder Weekly Digest aggregator (pure-ish, server-only).
//
// Builds the payload the /api/cron/founder-digest-weekly route + the
// /api/digest/preview endpoint hand to the email template. All heavy lifting
// (Supabase queries against `tbr_views`, `tbr_leads`, `svi_snapshots`) lives
// here so the cron route stays a thin orchestrator and the preview endpoint
// can share the exact same output the user will receive on Monday morning.
//
// Zero-signal weeks (no views, no leads, no SVI movement) return `null` so
// the caller can skip the send — silent weeks are worse than no email
// (see PROJECT rules: notification hub throttles for a reason).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface DigestActionRecommendation {
  /** Dimension key (ftv/mpc/ptd/tre/cgh/iri/lco/svm). */
  dimension: string;
  /** Human label, e.g. "Founder & Team". */
  label: string;
  /** Score /100 for the weakest dim. */
  score: number;
  /** Founder-facing headline copy for the "Do this next" block. */
  headline: string;
  /** One-sentence why. */
  reason: string;
  /** Deep-link CTA. */
  ctaUrl: string;
}

export interface DigestViewsSection {
  count: number;
  uniqueCountries: number;
  topCountry: string | null;
}

export interface DigestLeadsSection {
  count: number;
  items: Array<{
    firm: string | null;
    interestLevel: "exploring" | "warm" | "ready_to_talk";
    country: string | null;
  }>;
}

export interface DigestSviSection {
  current: number;
  previous: number | null;
  delta: number | null;
  newSnapshot: boolean;
}

export interface DigestPayload {
  userId: string;
  projectId: string | null;
  periodStart: string; // ISO
  periodEnd: string;   // ISO
  founderName: string;
  views: DigestViewsSection;
  leads: DigestLeadsSection;
  svi: DigestSviSection | null;
  topAction: DigestActionRecommendation | null;
  shareUrl: string | null;
  notificationsUrl: string;
}

// ---- Dimension metadata (kept local so this file has no other deps). --------

const DIM_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

const DIM_ACTIONS: Record<string, { headline: string; reason: string; href: string }> = {
  ftv: {
    headline: "Strengthen your founder & team story",
    reason: "Investors weight team quality above almost every other signal. Add a co-founder profile, key hires, and past exits.",
    href: "/workspace/business-report#ftv",
  },
  mpc: {
    headline: "Sharpen your market & problem framing",
    reason: "A tight TAM/SAM/SOM plus a crisp problem statement is the fastest lift for investor readiness.",
    href: "/workspace/business-report#mpc",
  },
  ptd: {
    headline: "Document your product & tech moat",
    reason: "Upload architecture notes, patents, or a demo-video link so this dim stops dragging your overall SVI down.",
    href: "/workspace/business-report#ptd",
  },
  tre: {
    headline: "Publish your traction numbers",
    reason: "MRR, growth rate, and pipeline are the single biggest lever on your Startup Value Index — even a screenshot helps.",
    href: "/workspace/business-report#tre",
  },
  cgh: {
    headline: "Clean up your cap table & governance",
    reason: "Upload a share register, ESOP grants, and board minutes. Investors ask for this on the second call.",
    href: "/workspace/cap-table",
  },
  iri: {
    headline: "Complete your investor-readiness pack",
    reason: "Missing pitch deck, financials, or data room folders? This dim scores the pack completeness directly.",
    href: "/workspace/investor",
  },
  lco: {
    headline: "Close your legal & compliance gaps",
    reason: "IP assignments, ESIC, and R&D tax status all live here. Upload the docs you already have — automation does the rest.",
    href: "/workspace/legal",
  },
  svm: {
    headline: "Articulate your strategic vision & moat",
    reason: "A one-page vision + defensibility narrative moves this dim from red to amber overnight.",
    href: "/workspace/business-report#svm",
  },
};

// ---- Helpers ---------------------------------------------------------------

function siteBase(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://blockid.au";
  return raw.replace(/\/+$/, "");
}

function pickTopCountry(rows: Array<{ viewer_country: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = (r.viewer_country ?? "").toUpperCase();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

interface DimScore {
  dim: string;
  score: number;
}

function extractDimScores(dimResults: unknown): DimScore[] {
  if (!dimResults || typeof dimResults !== "object") return [];
  const out: DimScore[] = [];
  for (const [k, v] of Object.entries(dimResults as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const s = (v as { score?: unknown }).score;
    if (typeof s === "number" && Number.isFinite(s)) {
      out.push({ dim: k, score: s });
    }
  }
  return out;
}

function weakestDim(dimScores: DimScore[]): DimScore | null {
  if (dimScores.length === 0) return null;
  return dimScores.reduce((min, d) => (d.score < min.score ? d : min), dimScores[0]);
}

// ---- Main builder ----------------------------------------------------------

export async function buildFounderDigest(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<DigestPayload | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  // Founder identity + display name.
  const { data: userRow } = await supabase
    .from("app_users")
    .select("id, email, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (!userRow) return null;
  const founderName =
    (userRow.display_name as string | null) ||
    (userRow.email as string | undefined)?.split("@")[0] ||
    "there";

  // Active/default project — used to scope leads + latest snapshot.
  const { data: projectRow } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .eq("is_default", true)
    .maybeSingle();
  const projectId: string | null = (projectRow?.id as string | undefined) ?? null;

  // Latest snapshot on this project — anchors the share URL + current SVI +
  // weakest-dim recommendation. Same ordering as /api/svi/report/views.
  let snapQ = supabase
    .from("svi_snapshots")
    .select("id, project_id, report_share_token, dim_results, svi_total, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  snapQ = projectId != null ? snapQ.eq("project_id", projectId) : snapQ.eq("account_id", userId);
  const { data: latestSnap } = await snapQ.maybeSingle();

  const shareToken: string | null =
    (latestSnap as { report_share_token: string | null } | null)?.report_share_token ?? null;
  const shareUrl = shareToken ? `${siteBase()}/tbr/${encodeURIComponent(shareToken)}` : null;

  // --- Section 1: TBR views in the period, scoped by the latest share token.
  let views: DigestViewsSection = { count: 0, uniqueCountries: 0, topCountry: null };
  if (shareToken) {
    const { data: viewRows } = await supabase
      .from("tbr_views")
      .select("viewer_country, viewer_device")
      .eq("share_token", shareToken)
      .gte("viewed_at", periodStartIso)
      .lt("viewed_at", periodEndIso)
      .limit(2000);
    const filtered = ((viewRows ?? []) as Array<{
      viewer_country: string | null;
      viewer_device: string | null;
    }>).filter((r) => (r.viewer_device ?? "unknown") !== "bot");
    const countries = new Set(
      filtered.map((r) => (r.viewer_country ?? "").toUpperCase()).filter(Boolean),
    );
    views = {
      count: filtered.length,
      uniqueCountries: countries.size,
      topCountry: pickTopCountry(filtered),
    };
  }

  // --- Section 2: New investor leads in the period.
  let leads: DigestLeadsSection = { count: 0, items: [] };
  if (projectId) {
    const { data: leadRows } = await supabase
      .from("tbr_leads")
      .select("investor_firm, interest_level, viewer_country")
      .eq("project_id", projectId)
      .gte("created_at", periodStartIso)
      .lt("created_at", periodEndIso)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (leadRows ?? []) as Array<{
      investor_firm: string | null;
      interest_level: "exploring" | "warm" | "ready_to_talk";
      viewer_country: string | null;
    }>;
    leads = {
      count: rows.length,
      items: rows.slice(0, 10).map((r) => ({
        firm: r.investor_firm ?? null,
        interestLevel: r.interest_level,
        country: (r.viewer_country ?? "").toUpperCase() || null,
      })),
    };
  }

  // --- Section 3: SVI delta vs the snapshot at (or just before) period_start.
  let svi: DigestSviSection | null = null;
  if (latestSnap) {
    const currentScore = Number((latestSnap as { svi_total: number | null }).svi_total ?? 0);
    const currentCreatedAt = (latestSnap as { created_at: string }).created_at;
    const isNew = currentCreatedAt >= periodStartIso && currentCreatedAt < periodEndIso;

    // Baseline snapshot: newest snapshot with created_at < periodStart.
    let baselineQ = supabase
      .from("svi_snapshots")
      .select("svi_total, created_at")
      .lt("created_at", periodStartIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (projectId != null) baselineQ = baselineQ.eq("project_id", projectId);
    else baselineQ = baselineQ.eq("account_id", userId);
    const { data: baseline } = await baselineQ.maybeSingle();
    const previous =
      baseline && typeof (baseline as { svi_total: number | null }).svi_total === "number"
        ? Number((baseline as { svi_total: number }).svi_total)
        : null;
    const delta = previous !== null ? currentScore - previous : null;
    svi = {
      current: currentScore,
      previous,
      delta,
      newSnapshot: isNew,
    };
  }

  // --- Section 4: Top action = weakest dim from the latest snapshot.
  let topAction: DigestActionRecommendation | null = null;
  if (latestSnap) {
    const scores = extractDimScores((latestSnap as { dim_results: unknown }).dim_results);
    const weakest = weakestDim(scores);
    if (weakest) {
      const meta = DIM_ACTIONS[weakest.dim] ?? {
        headline: "Improve your weakest dimension",
        reason: "Focus this week on the SVI dimension with the biggest headroom.",
        href: "/workspace/business-report",
      };
      topAction = {
        dimension: weakest.dim,
        label: DIM_LABELS[weakest.dim] ?? weakest.dim.toUpperCase(),
        score: Math.round(weakest.score),
        headline: meta.headline,
        reason: meta.reason,
        ctaUrl: `${siteBase()}${meta.href}`,
      };
    }
  }

  // Skip decision — no signal, no email.
  const hasSviMovement =
    svi !== null && (svi.newSnapshot || (svi.delta !== null && svi.delta !== 0));
  if (views.count === 0 && leads.count === 0 && !hasSviMovement) {
    return null;
  }

  return {
    userId,
    projectId,
    periodStart: periodStartIso,
    periodEnd: periodEndIso,
    founderName,
    views,
    leads,
    svi,
    topAction,
    shareUrl,
    notificationsUrl: `${siteBase()}/workspace/notifications`,
  };
}
