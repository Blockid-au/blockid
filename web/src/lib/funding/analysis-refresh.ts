// Quarterly expert analysis refresh (T0251, plan §4h Growth row: quarterly
// "what changed for your startup").
//
// For every Growth founder (tier ≥ growth, or an active Startup Package
// grant) and each of their projects, the 1st of the quarter builds a short
// markdown note from three sources and stores it in `analysis_refreshes`
// (migration 0323):
//
//   1. SVI delta       — latest `svi_snapshots` row on/before the quarter end
//                        vs the latest on/before the quarter start;
//   2. catalogue moves — `funding_matches` rows for the project that were
//                        first seen (new), or flipped to closed / paused
//                        (status_at_match + updated_at) inside the quarter;
//   3. expert research — CFO / CLO `agent_knowledge_base` rows updated inside
//                        the quarter, top 3 by industry relevance.
//
// `changes` = 1 (SVI moved) + new + closed + paused + knowledge rows. A
// zero-change quarter still stores the note (the tab shows "nothing moved")
// but writes NO `analysis_refresh` notification (D-3: never a hollow ping).
//
// Layout mirrors radar-sweep.ts: pure helpers (quarter maths, composeRefresh)
// + a `RefreshStore` interface tests fake + the Supabase store + the runner
// the cron route calls.

import type { NotificationKind } from "@/lib/notification-kinds";
import { PLAN_ID_TO_TIER_MAP } from "@/lib/segments";
import { fill, FUNDING_COPY } from "./copy";
import { sectorTokensFor } from "./investor-match";
import { listActiveStartupPackageUserIds } from "./growth-extras";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Quarter {
  /** "2026-Q3" */
  label: string;
  /** ISO day, inclusive. */
  start: string;
  /** ISO day, inclusive. */
  end: string;
}

export interface MatchChange {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  closes_at: string | null;
}

export interface KnowledgeItem {
  agent: string;
  topic: string;
  findings: string[];
  implications: string | null;
  updated_at: string;
}

export interface RefreshProject {
  id: string | null;
  name: string;
  industry: string | null;
}

export interface RefreshInput {
  project: RefreshProject;
  quarter: Quarter;
  svi: { prev: number | null; now: number | null };
  matches: { added: MatchChange[]; closed: MatchChange[]; paused: MatchChange[] };
  knowledge: KnowledgeItem[];
}

export interface RefreshNote {
  quarter: string;
  title: string;
  body_md: string;
  changes: number;
  meta: {
    svi: { prev: number | null; now: number | null; delta: number | null };
    matches: { added: number; closed: number; paused: number };
    knowledge: number;
  };
}

/** Mirror of `analysis_refreshes`. */
export interface AnalysisRefreshRow {
  id: string | null;
  user_id: string;
  project_id: string | null;
  quarter: string;
  body_md: string;
  changes: number;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface RefreshNotifyArgs {
  userId: string;
  projectId?: string | null;
  kind: NotificationKind;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  throttleMs?: number;
}

export interface RefreshStore {
  listGrowthUsers(now: Date): Promise<Array<{ userId: string; plan: string | null }>>;
  listProjects(userId: string): Promise<RefreshProject[]>;
  /** Latest SVI (index_value ?? svi_total) with snapshot_date ≤ `onOrBefore` (ISO day). */
  sviOnOrBefore(userId: string, projectId: string | null, onOrBefore: string): Promise<number | null>;
  listMatchChanges(userId: string, projectId: string | null, q: Quarter): Promise<RefreshInput["matches"]>;
  /** CFO / CLO rows updated inside the quarter (unranked; the builder ranks). */
  listKnowledge(q: Quarter): Promise<KnowledgeItem[]>;
  hasRefresh(userId: string, projectId: string | null, quarter: string): Promise<boolean>;
  saveRefresh(row: Omit<AnalysisRefreshRow, "id" | "created_at">): Promise<void>;
  notify(args: RefreshNotifyArgs): Promise<void>;
}

export interface RefreshRunOptions {
  now?: Date;
  dryRun?: boolean;
  store?: RefreshStore | null;
  db?: SupabaseLike | null;
  /** Re-run for a quarter that already has a row (writes are still skipped unless `force`). */
  force?: boolean;
}

export interface RefreshRunSummary {
  ok: boolean;
  dryRun: boolean;
  quarter: string;
  users: number;
  projects: number;
  /** Notes stored — "would store" on dryRun. */
  written: number;
  /** Notifications written (changes > 0 only). */
  notified: number;
  /** (user, project, quarter) already had a note. */
  skipped: number;
  errors: number;
  error?: string;
  /** Dry run only: every note that would be stored. */
  notes?: Array<{ userId: string; projectId: string | null; changes: number; title: string }>;
}

export const KNOWLEDGE_AGENTS = ["cfo", "clo"] as const;
export const KNOWLEDGE_TOP_N = 3;
export const REFRESH_HREF = "/workspace/funding?tab=refresh";
/** ≤ 1 refresh notification per (project, quarter) — 100 days covers a late re-run. */
export const REFRESH_THROTTLE_MS = 100 * 24 * 60 * 60 * 1000;

// ─── Pure: quarter maths ─────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The quarter that just ended relative to `now` (UTC). 2026-10-01 → 2026-Q3 (Jul 1 – Sep 30). */
export function previousQuarter(now: Date): Quarter {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const currentQ = Math.floor(m / 3); // 0-3
  const prevQ = currentQ === 0 ? 3 : currentQ - 1;
  const prevY = currentQ === 0 ? y - 1 : y;
  const start = new Date(Date.UTC(prevY, prevQ * 3, 1));
  const end = new Date(Date.UTC(prevY, prevQ * 3 + 3, 0)); // day 0 of next quarter's first month = last day
  return { label: `${prevY}-Q${prevQ + 1}`, start: isoDay(start), end: isoDay(end) };
}

/** First day of the quarter after `q` — when the next note lands. */
export function nextRefreshDate(q: Quarter): string {
  const end = new Date(`${q.end}T00:00:00Z`);
  return isoDay(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)));
}

// ─── Pure: knowledge ranking ─────────────────────────────────────────────────

/** Rank CFO/CLO rows by industry-token hits (topic ×2, body ×1), newest first on ties; top N. */
export function rankKnowledge(items: readonly KnowledgeItem[], industry: string | null, n = KNOWLEDGE_TOP_N): KnowledgeItem[] {
  const tokens = sectorTokensFor(industry).filter((t) => t.length >= 3);
  const scored = items.map((k) => {
    const topic = k.topic.toLowerCase().replace(/[^a-z0-9]/g, "");
    const body = `${k.findings.join(" ")} ${k.implications ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    let score = 0;
    for (const t of tokens) {
      if (topic.includes(t)) score += 2;
      if (body.includes(t)) score += 1;
    }
    return { k, score };
  });
  scored.sort((a, b) => b.score - a.score || b.k.updated_at.localeCompare(a.k.updated_at));
  return scored.slice(0, Math.max(0, n)).map((s) => s.k);
}

// ─── Pure: compose ───────────────────────────────────────────────────────────

function fmtDelta(prev: number | null, now: number | null): { delta: number | null; line: string } {
  if (prev === null && now === null) return { delta: null, line: "No SVI snapshot yet — run your score to start the trend." };
  if (prev === null) return { delta: null, line: `First SVI on record: **${Math.round(now!)}**.` };
  if (now === null) return { delta: null, line: `SVI was ${Math.round(prev)} at the start of the quarter; no newer snapshot.` };
  const delta = Math.round(now - prev);
  if (delta === 0) return { delta: 0, line: `SVI held at **${Math.round(now)}** across the quarter.` };
  return { delta, line: `SVI moved **${Math.round(prev)} → ${Math.round(now)}** (${delta > 0 ? "+" : ""}${delta}).` };
}

function list(items: readonly MatchChange[], verb: string): string[] {
  return items.map((m) => `- ${m.name} (${m.ref_kind}) ${verb}${m.closes_at ? ` — closes ${m.closes_at}` : ""}`);
}

/** Build the markdown note. Pure; `changes` drives the notification decision. */
export function composeRefresh(input: RefreshInput): RefreshNote {
  const { project, quarter } = input;
  const svi = fmtDelta(input.svi.prev, input.svi.now);
  const knowledge = rankKnowledge(input.knowledge, project.industry);
  const added = input.matches.added.length;
  const closed = input.matches.closed.length;
  const paused = input.matches.paused.length;
  const changes = (svi.delta !== null && svi.delta !== 0 ? 1 : 0) + added + closed + paused + knowledge.length;

  const lines: string[] = [];
  lines.push(`# What changed for ${project.name} — ${quarter.label}`);
  lines.push("");
  lines.push(`_Covers ${quarter.start} to ${quarter.end}. Prepared by the BlockID CFO / CLO agents from your SVI snapshots, your Money Radar matches and this quarter's research._`);
  lines.push("");
  lines.push("## 1. Your SVI");
  lines.push(svi.line);
  lines.push("");
  lines.push("## 2. Money on your list");
  if (added + closed + paused === 0) {
    lines.push("No grant or program on your matches opened, closed or paused this quarter.");
  } else {
    if (added) lines.push(`**${added} new match${added === 1 ? "" : "es"}**`, ...list(input.matches.added, "joined your list"));
    if (closed) lines.push(`**${closed} closed**`, ...list(input.matches.closed, "closed"));
    if (paused) lines.push(`**${paused} paused**`, ...list(input.matches.paused, "paused"));
  }
  lines.push("");
  lines.push("## 3. What the experts learned");
  if (!knowledge.length) {
    lines.push("No new CFO / CLO research touched your industry this quarter.");
  } else {
    for (const k of knowledge) {
      lines.push(`### ${k.agent.toUpperCase()} — ${k.topic}`);
      for (const f of k.findings.slice(0, 3)) lines.push(`- ${f}`);
      if (k.implications) lines.push(`_For you: ${k.implications}_`);
      lines.push("");
    }
  }
  lines.push("## Next step");
  lines.push(
    changes > 0
      ? "Open the Grants tab, re-run your match so the timeline reflects these changes, and draft the application for the earliest deadline."
      : "Nothing moved — keep your evidence current in the data room so the next SVI snapshot has something to score.",
  );

  const title =
    changes > 0
      ? fill(FUNDING_COPY.notification.analysis_refresh, { n: changes })
      : FUNDING_COPY.notification.analysis_refresh_noCount;

  return {
    quarter: quarter.label,
    title,
    body_md: lines.join("\n").trim() + "\n",
    changes,
    meta: {
      svi: { prev: input.svi.prev, now: input.svi.now, delta: svi.delta },
      matches: { added, closed, paused },
      knowledge: knowledge.length,
    },
  };
}

// ─── Builder (one user × project) ────────────────────────────────────────────

export async function buildAnalysisRefresh(
  userId: string,
  project: RefreshProject,
  opts: { now?: Date; store: RefreshStore; quarter?: Quarter },
): Promise<RefreshNote> {
  const now = opts.now ?? new Date();
  const quarter = opts.quarter ?? previousQuarter(now);
  const { store } = opts;
  const [prev, cur, matches, knowledge] = await Promise.all([
    store.sviOnOrBefore(userId, project.id, quarter.start),
    store.sviOnOrBefore(userId, project.id, quarter.end),
    store.listMatchChanges(userId, project.id, quarter),
    store.listKnowledge(quarter),
  ]);
  return composeRefresh({ project, quarter, svi: { prev, now: cur }, matches, knowledge });
}

// ─── Runner (cron) ───────────────────────────────────────────────────────────

export async function runAnalysisRefreshQuarterly(opts: RefreshRunOptions = {}): Promise<RefreshRunSummary> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const quarter = previousQuarter(now);
  const summary: RefreshRunSummary = {
    ok: true,
    dryRun,
    quarter: quarter.label,
    users: 0,
    projects: 0,
    written: 0,
    notified: 0,
    skipped: 0,
    errors: 0,
    ...(dryRun ? { notes: [] } : {}),
  };

  let store = opts.store ?? null;
  if (!store) {
    const db = opts.db ?? (await import("@/lib/supabase")).getSupabaseAdmin();
    if (!db) return { ...summary, ok: false, error: "supabase_unavailable" };
    store = createSupabaseRefreshStore(db);
  }

  let users: Array<{ userId: string; plan: string | null }>;
  try {
    users = await store.listGrowthUsers(now);
  } catch (err) {
    return { ...summary, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  summary.users = users.length;
  // Knowledge is the same for everyone this quarter — read once.
  let knowledge: KnowledgeItem[] = [];
  try {
    knowledge = await store.listKnowledge(quarter);
  } catch {
    knowledge = [];
  }
  const sharedStore: RefreshStore = { ...store, listKnowledge: async () => knowledge };

  for (const u of users) {
    let projects: RefreshProject[] = [];
    try {
      projects = await store.listProjects(u.userId);
    } catch {
      summary.errors += 1;
      continue;
    }
    if (!projects.length) projects = [{ id: null, name: "Your startup", industry: null }];
    for (const p of projects) {
      summary.projects += 1;
      try {
        if (!opts.force && (await store.hasRefresh(u.userId, p.id, quarter.label))) {
          summary.skipped += 1;
          continue;
        }
        const note = await buildAnalysisRefresh(u.userId, p, { now, store: sharedStore, quarter });
        summary.written += 1;
        if (dryRun) {
          summary.notes!.push({ userId: u.userId, projectId: p.id, changes: note.changes, title: note.title });
          if (note.changes > 0) summary.notified += 1;
          continue;
        }
        await store.saveRefresh({ user_id: u.userId, project_id: p.id, quarter: note.quarter, body_md: note.body_md, changes: note.changes, meta: note.meta });
        if (note.changes > 0) {
          await store.notify({
            userId: u.userId,
            projectId: p.id,
            kind: "analysis_refresh",
            payload: { changes: note.changes, title: note.title, quarter: note.quarter, href: REFRESH_HREF, startup: p.name },
            dedupeKey: `analysis_refresh:${p.id ?? u.userId}:${note.quarter}`,
            throttleMs: REFRESH_THROTTLE_MS,
          });
          summary.notified += 1;
        }
      } catch (err) {
        summary.errors += 1;
        console.warn("[analysis-refresh] project failed", u.userId, p.id, err instanceof Error ? err.message : String(err));
      }
    }
  }
  return summary;
}

// ─── Supabase store ──────────────────────────────────────────────────────────

export interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Founder plan ids at or above the Growth rung (legacy `growth` / `growth_annual` included). */
export function growthPlanIds(): string[] {
  return Object.entries(PLAN_ID_TO_TIER_MAP)
    .filter(([id, tier]) => ["growth", "scale", "enterprise"].includes(tier) && !id.startsWith("accel") && !id.startsWith("investor"))
    .map(([id]) => id);
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function createSupabaseRefreshStore(db: SupabaseLike): RefreshStore {
  return {
    async listGrowthUsers(now) {
      const out = new Map<string, { userId: string; plan: string | null }>();
      const { data: users } = await db.from("app_users").select("id, plan").in("plan", growthPlanIds()).limit(10_000);
      for (const u of (users ?? []) as Array<{ id: string; plan: string | null }>) out.set(u.id, { userId: u.id, plan: u.plan });
      // An active Startup Package purchase counts as Growth extras (review
      // 2026-09-10 #4: the `startup_package` entitlement is never granted to
      // buyers — the purchase signal lives in growth-extras.ts).
      const packageIds = await listActiveStartupPackageUserIds(db, { now });
      if (packageIds.size > 0) {
        const { data: buyers } = await db.from("app_users").select("id, plan").in("id", [...packageIds]);
        for (const u of (buyers ?? []) as Array<{ id: string; plan: string | null }>) {
          if (!out.has(u.id)) out.set(u.id, { userId: u.id, plan: u.plan });
        }
      }
      return [...out.values()];
    },

    async listProjects(userId) {
      const { data } = await db.from("projects").select("id, name, industry, archived_at").eq("user_id", userId);
      return ((data ?? []) as Array<{ id: string; name: string | null; industry: string | null; archived_at: string | null }>)
        .filter((p) => p.id && !p.archived_at)
        .map((p) => ({ id: p.id, name: p.name ?? "Your startup", industry: p.industry ?? null }));
    },

    async sviOnOrBefore(userId, projectId, onOrBefore) {
      try {
        if (projectId) {
          const { data } = await db
            .from("svi_snapshots")
            .select("index_value, svi_total, snapshot_date")
            .eq("project_id", projectId)
            .lte("snapshot_date", onOrBefore)
            .order("snapshot_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) return toNum((data as { index_value: unknown }).index_value) ?? toNum((data as { svi_total: unknown }).svi_total);
        }
        const { data: acct } = await db.from("svi_accounts").select("id").eq("user_id", userId).limit(1).maybeSingle();
        if (!acct) return null;
        const { data } = await db
          .from("svi_snapshots")
          .select("index_value, svi_total, snapshot_date")
          .eq("account_id", (acct as { id: string }).id)
          .lte("snapshot_date", onOrBefore)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return null;
        return toNum((data as { index_value: unknown }).index_value) ?? toNum((data as { svi_total: unknown }).svi_total);
      } catch {
        return null;
      }
    },

    async listMatchChanges(userId, projectId, q) {
      const empty = { added: [], closed: [], paused: [] };
      try {
        let query = db
          .from("funding_matches")
          .select("ref_kind, ref_id, status_at_match, closes_at, first_seen_at, updated_at")
          .eq("user_id", userId);
        query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
        const { data } = await query.limit(1000);
        const rows = (data ?? []) as Array<{
          ref_kind: "grant" | "program";
          ref_id: string;
          status_at_match: string;
          closes_at: string | null;
          first_seen_at: string;
          updated_at: string;
        }>;
        const start = `${q.start}T00:00:00Z`;
        const end = `${q.end}T23:59:59Z`;
        const inQ = (iso: string | null) => !!iso && iso >= start && iso <= end;
        const grantIds = rows.filter((r) => r.ref_kind === "grant").map((r) => r.ref_id);
        const programIds = rows.filter((r) => r.ref_kind === "program").map((r) => r.ref_id);
        const names = new Map<string, string>();
        if (grantIds.length) {
          const { data: g } = await db.from("au_grants").select("id, name").in("id", grantIds);
          for (const r of (g ?? []) as Array<{ id: string; name: string }>) names.set(`grant:${r.id}`, r.name);
        }
        if (programIds.length) {
          const { data: p } = await db.from("au_programs").select("id, name").in("id", programIds);
          for (const r of (p ?? []) as Array<{ id: string; name: string }>) names.set(`program:${r.id}`, r.name);
        }
        const change = (r: (typeof rows)[number]): MatchChange => ({
          ref_kind: r.ref_kind,
          ref_id: r.ref_id,
          name: names.get(`${r.ref_kind}:${r.ref_id}`) ?? r.ref_id,
          closes_at: r.closes_at,
        });
        return {
          added: rows.filter((r) => inQ(r.first_seen_at)).map(change),
          closed: rows.filter((r) => r.status_at_match === "closed" && inQ(r.updated_at) && !inQ(r.first_seen_at)).map(change),
          paused: rows.filter((r) => r.status_at_match === "paused" && inQ(r.updated_at) && !inQ(r.first_seen_at)).map(change),
        };
      } catch {
        return empty;
      }
    },

    async listKnowledge(q) {
      try {
        const { data } = await db
          .from("agent_knowledge_base")
          .select("agent, topic, data, updated_at")
          .in("agent", [...KNOWLEDGE_AGENTS])
          .gte("updated_at", `${q.start}T00:00:00Z`)
          .lte("updated_at", `${q.end}T23:59:59Z`)
          .order("updated_at", { ascending: false })
          .limit(200);
        return ((data ?? []) as Array<{ agent: string; topic: string; data: Record<string, unknown> | null; updated_at: string }>).map((r) => {
          const d = r.data ?? {};
          const findings = Array.isArray(d.key_findings) ? d.key_findings.map((f) => String(f)).filter(Boolean) : [];
          const implications = typeof d.implications_for_au_startups === "string" ? d.implications_for_au_startups : null;
          return { agent: r.agent, topic: r.topic, findings, implications, updated_at: r.updated_at };
        });
      } catch {
        return [];
      }
    },

    async hasRefresh(userId, projectId, quarter) {
      try {
        let query = db.from("analysis_refreshes").select("id").eq("user_id", userId).eq("quarter", quarter);
        query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
        const { data } = await query.limit(1).maybeSingle();
        return !!data;
      } catch {
        return false;
      }
    },

    async saveRefresh(row) {
      const { error } = await db.from("analysis_refreshes").upsert(row, { onConflict: "user_id,project_key,quarter" });
      if (error) throw new Error(error.message ?? "analysis_refreshes upsert failed");
    },

    async notify(args) {
      const { insertNotification } = await import("@/lib/notifications");
      await insertNotification(args);
    },
  };
}

/** Latest stored note for the workspace tab (Growth founders). Never throws. */
export async function latestAnalysisRefresh(
  userId: string,
  projectId: string | null,
  opts: { db?: SupabaseLike | null } = {},
): Promise<AnalysisRefreshRow | null> {
  try {
    const db = opts.db ?? (await import("@/lib/supabase")).getSupabaseAdmin();
    if (!db) return null;
    let query = db.from("analysis_refreshes").select("*").eq("user_id", userId);
    query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
    const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return {
      id: String(r.id),
      user_id: String(r.user_id),
      project_id: (r.project_id as string | null) ?? null,
      quarter: String(r.quarter),
      body_md: String(r.body_md ?? ""),
      changes: Number(r.changes ?? 0) || 0,
      meta: r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {},
      created_at: String(r.created_at ?? ""),
    };
  } catch {
    return null;
  }
}
