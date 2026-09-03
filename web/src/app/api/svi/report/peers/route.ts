// GET /api/svi/report/peers?projectId=<pid>
// GET /api/svi/report/peers?token=<share_token>       (public — for TBR share)
//
// Wave 25C — Peer-5 similarity match. Replaces the abstract "AU seed median"
// cohort widget with 5 concrete anonymised peer startups most similar to the
// caller's startup on the 8-dim SVI vector (cosine similarity).
//
// STRICT ANONYMISATION (non-negotiable): the response NEVER includes
// startup_name, founder details, ABN, email, project_id, account_id, or any
// column that could de-anonymise a peer. Only industry, stage, aggregate
// scores, and top-line dim insights are returned. Codenames "Startup A"…"E"
// are assigned in rank order.
//
// Response:
//   {
//     ok: true,
//     peers: [{ rank, codename, industry, stage, sviScore,
//                topStrengthDim, topStrengthScore, primaryGapDim, primaryGapScore,
//                similarityPct }],
//     fallback?: "cross_sector"           // triggered when <5 industry+stage peers
//   }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
type DimKey = (typeof DIM_KEYS)[number];

const DIM_LABEL: Record<DimKey, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

type DimScoresRow = Partial<Record<DimKey, number>> | null;

interface SnapshotRow {
  id: string;
  account_id: string | null;
  project_id: string | null;
  svi_total: number | null;
  dimension_scores: DimScoresRow;
  dim_results: unknown;
  created_at: string;
}

interface AccountRow {
  id: string;
  user_id: string | null;
  industry: string | null;
  current_stage: string | number | null;
}

/** Extract an 8-dim vector from a snapshot row, preferring dim_results (full)
 *  over dimension_scores (compact). Returns null when no scores are available. */
function extractVector(row: SnapshotRow): number[] | null {
  // dim_results is a serialised Record<DimKey, DimState> from the client.
  if (row.dim_results && typeof row.dim_results === "object") {
    const rec = row.dim_results as Record<string, { score?: number | null }>;
    const vec = DIM_KEYS.map((k) => Number(rec[k]?.score ?? NaN));
    if (vec.every((v) => Number.isFinite(v))) return vec;
  }
  if (row.dimension_scores) {
    const rec = row.dimension_scores as Record<string, number>;
    const vec = DIM_KEYS.map((k) => Number(rec[k] ?? NaN));
    if (vec.every((v) => Number.isFinite(v))) return vec;
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function normaliseStage(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).toLowerCase().trim();
}

/** Fetch the caller's own snapshot (via projectId or share token) to derive
 *  the "self" vector + industry/stage bucket. */
async function loadSelf(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  args: { userId?: string; projectId?: string; token?: string },
): Promise<{
  vector: number[];
  accountId: string | null;
  industry: string;
  stage: string;
} | null> {
  if (!supabase) return null;

  if (args.token) {
    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("id, account_id, project_id, svi_total, dimension_scores, dim_results, created_at")
      .eq("report_share_token", args.token)
      .maybeSingle();
    if (!snap) return null;
    const vector = extractVector(snap as SnapshotRow);
    if (!vector) return null;
    const { data: acct } = await supabase
      .from("svi_accounts")
      .select("id, user_id, industry, current_stage")
      .eq("id", (snap as SnapshotRow).account_id ?? "")
      .maybeSingle();
    const a = (acct as AccountRow | null) ?? null;
    return {
      vector,
      accountId: (snap as SnapshotRow).account_id,
      industry: (a?.industry ?? "").trim(),
      stage: normaliseStage(a?.current_stage),
    };
  }

  if (!args.userId) return null;
  const { data: acct } = await supabase
    .from("svi_accounts")
    .select("id, user_id, industry, current_stage")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const account = (acct as AccountRow | null) ?? null;
  const accountId = account?.id ?? null;
  if (!accountId) return null;

  let q = supabase
    .from("svi_snapshots")
    .select("id, account_id, project_id, svi_total, dimension_scores, dim_results, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (args.projectId && args.projectId !== "default") {
    q = q.eq("project_id", args.projectId);
  }
  const { data: snap } = await q.maybeSingle();
  if (!snap) return null;
  const vector = extractVector(snap as SnapshotRow);
  if (!vector) return null;
  return {
    vector,
    accountId,
    industry: (account?.industry ?? "").trim(),
    stage: normaliseStage(account?.current_stage),
  };
}

interface PeerCandidate {
  vector: number[];
  sviScore: number;
  industry: string;
  stage: string;
  similarity: number;
}

async function fetchCandidatePool(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  excludeAccountId: string | null,
  industry: string,
  stage: string,
): Promise<PeerCandidate[]> {
  // Two-tier fetch: same industry+stage first, then broaden to cross-sector
  // when the bucket is too small. Cap at 200 rows so ranking stays cheap.
  const projectSelect =
    "id, account_id, project_id, svi_total, dimension_scores, dim_results, created_at";

  const bucketedQuery = async (filterIndustry: boolean, filterStage: boolean) => {
    // NOTE: to keep the query anonymised we DO NOT join svi_accounts here.
    // Industry / stage are re-derived by a second lookup on the winning
    // account ids only. This costs one extra query but keeps the peer set
    // free of any accidental PII leak into logs.
    let q = supabase
      .from("svi_snapshots")
      .select(projectSelect)
      .not("dimension_scores", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (excludeAccountId) q = q.neq("account_id", excludeAccountId);
    const { data } = await q;
    if (!data) return [] as SnapshotRow[];
    // We still need to filter by industry+stage — do it via a join on
    // svi_accounts, but ONLY select the fields we need + never expose them.
    let rows = data as SnapshotRow[];
    if (filterIndustry || filterStage) {
      const acctIds = Array.from(
        new Set(rows.map((r) => r.account_id).filter((v): v is string => !!v)),
      );
      if (acctIds.length === 0) return [];
      const { data: accts } = await supabase
        .from("svi_accounts")
        .select("id, industry, current_stage")
        .in("id", acctIds);
      const byId = new Map<string, { industry: string; stage: string }>();
      for (const a of (accts as AccountRow[] | null) ?? []) {
        byId.set(a.id, {
          industry: (a.industry ?? "").trim(),
          stage: normaliseStage(a.current_stage),
        });
      }
      rows = rows.filter((r) => {
        const meta = r.account_id ? byId.get(r.account_id) : undefined;
        if (!meta) return false;
        if (filterIndustry && industry && meta.industry.toLowerCase() !== industry.toLowerCase()) {
          return false;
        }
        if (filterStage && stage && meta.stage !== stage) return false;
        return true;
      });
      // Stash meta on the row so we don't have to re-query — using a symbol
      // to avoid contaminating the SnapshotRow shape.
      for (const r of rows) {
        const m = r.account_id ? byId.get(r.account_id) : undefined;
        if (m) (r as SnapshotRow & { _meta?: { industry: string; stage: string } })._meta = m;
      }
    }
    return rows;
  };

  const materialise = (rows: SnapshotRow[]): PeerCandidate[] => {
    const out: PeerCandidate[] = [];
    for (const r of rows) {
      const vec = extractVector(r);
      if (!vec) continue;
      const meta = (r as SnapshotRow & { _meta?: { industry: string; stage: string } })._meta;
      out.push({
        vector: vec,
        sviScore: Math.max(0, Math.min(100, Number(r.svi_total ?? 0))),
        industry: meta?.industry ?? "",
        stage: meta?.stage ?? "",
        similarity: 0,
      });
    }
    return out;
  };

  // Tier 1: industry + stage
  if (industry && stage) {
    const tier1 = materialise(await bucketedQuery(true, true));
    if (tier1.length >= 5) return tier1;
  }
  // Tier 2: industry only
  if (industry) {
    const tier2 = materialise(await bucketedQuery(true, false));
    if (tier2.length >= 5) return tier2;
  }
  // Tier 3: any peer — cross-sector fallback
  return materialise(await bucketedQuery(false, false));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const token = url.searchParams.get("token") ?? undefined;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  let self: Awaited<ReturnType<typeof loadSelf>> = null;
  if (token) {
    self = await loadSelf(supabase, { token });
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    self = await loadSelf(supabase, { userId: user.id, projectId });
  }
  if (!self) {
    return NextResponse.json({ ok: false, error: "no_self_snapshot" }, { status: 404 });
  }

  const pool = await fetchCandidatePool(supabase, self.accountId, self.industry, self.stage);
  const scored = pool.map((c) => ({
    ...c,
    similarity: cosineSimilarity(self!.vector, c.vector),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(0, 5);

  // Detect fallback tier so the UI can render an honest disclaimer instead
  // of pretending we found 5 same-sector peers.
  const industryMatches = top.filter(
    (p) => self!.industry && p.industry.toLowerCase() === self!.industry.toLowerCase(),
  ).length;
  const fallback: string | undefined =
    top.length < 5 || industryMatches < top.length ? "cross_sector" : undefined;

  // ── Anonymise + shape response ────────────────────────────────────────
  // Codenames replace startup names in rank order. Never emit account_id,
  // project_id, or any field that isn't in the whitelist below.
  const CODENAMES = ["Startup A", "Startup B", "Startup C", "Startup D", "Startup E"];
  const peers = top.map((p, idx) => {
    // Top strength / gap dims computed from the peer vector.
    let strengthIdx = 0;
    let gapIdx = 0;
    for (let i = 1; i < p.vector.length; i += 1) {
      if (p.vector[i] > p.vector[strengthIdx]) strengthIdx = i;
      if (p.vector[i] < p.vector[gapIdx]) gapIdx = i;
    }
    const strengthKey = DIM_KEYS[strengthIdx];
    const gapKey = DIM_KEYS[gapIdx];
    return {
      rank: idx + 1,
      codename: CODENAMES[idx] ?? `Startup ${idx + 1}`,
      industry: p.industry || "Cross-sector",
      stage: p.stage || "seed",
      sviScore: p.sviScore,
      topStrengthDim: strengthKey,
      topStrengthLabel: DIM_LABEL[strengthKey],
      topStrengthScore: Math.round(p.vector[strengthIdx]),
      primaryGapDim: gapKey,
      primaryGapLabel: DIM_LABEL[gapKey],
      primaryGapScore: Math.round(p.vector[gapIdx]),
      similarityPct: Math.round(p.similarity * 100),
    };
  });

  return NextResponse.json({
    ok: true,
    peers,
    ...(fallback ? { fallback } : {}),
    selfIndustry: self.industry || null,
    selfStage: self.stage || null,
  });
}
