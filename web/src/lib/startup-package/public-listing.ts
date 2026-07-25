// Public /startup/[slug] listing data layer (subgoal 9).
//
// Server-only helpers that read the projects/svi_snapshots/assembled_reports/
// startup_package_reserved_allocations tables and shape the payload the
// public listing page renders. Kept isolated so:
//   * the page.tsx is pure JSX + data-in-props (easy to snapshot),
//   * pure formatting helpers (buildHero, extractCards) stay unit-testable,
//   * DB access is fenced behind isSupabaseConfigured — the marketing-site
//     dev mode (no Supabase env) never explodes, it just returns null and
//     the page 404s (matches showcase pattern).
//
// The tables that this module reads live in migration 0116 (subgoal cluster
// 1) — this cluster only reads them. Every SELECT is defensive: unknown
// columns come back as null and the shape helpers tolerate that so we can
// merge before 0116 lands without breaking prod.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ── Interview step keys the public listing surfaces ─────────────────────── */

/**
 * Ordered set of interview keys the public hero + cards read from
 * `startup_package_interview`. The order matches the Package guided
 * interview (subgoal 3). If any of these are missing the card is dropped —
 * the page never renders an empty section.
 */
export const PUBLIC_INTERVIEW_KEYS = [
  "one_line_pitch",
  "problem",
  "solution",
  "traction",
] as const;

export type PublicInterviewKey = (typeof PUBLIC_INTERVIEW_KEYS)[number];

/* ── Row shapes (what we read out of Supabase) ────────────────────────────── */

export interface ProjectPublicRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  package_purchased_at: string | null;
  package_ticker: string | null;
  created_at: string;
}

export interface InterviewAnswerRow {
  step_key: string;
  answer_text: string;
  char_count: number | null;
}

export interface AssembledReportRow {
  id: string;
  title: string;
  executive_summary: string | null;
  full_markdown: string | null;
  report_type: string | null;
  public: boolean | null;
  created_at: string;
}

export interface ReservedAllocationRow {
  pct_reserved: number;
  ticker_hint: string | null;
  on_chain_token_id: string | null;
  opt_in_at: string | null;
}

export interface SviSnapshotRow {
  svi_total: number | null;
  index_value: number | null;
  stage: number | null;
  snapshot_date: string | null;
}

export interface FounderContactRow {
  email: string | null;
  display_name: string | null;
  public_contact_opt_in: boolean | null;
}

/* ── Assembled public payload ─────────────────────────────────────────────── */

export interface PublicListingPayload {
  project: ProjectPublicRow;
  hero: {
    name: string;
    onelinePitch: string;
    industry: string | null;
  };
  cards: PublicListingCard[];
  svi: {
    total: number;
    index: number | null;
    band: SviBand;
    label: string;
  } | null;
  reservedAllocation: {
    pctReserved: number;
    ticker: string;
    onChain: boolean;
    ctaLabel: string;
  } | null;
  publicReports: {
    id: string;
    title: string;
    excerpt: string;
    createdAt: string;
  }[];
  contact: {
    kind: "mailto" | "form";
    href: string;
    displayName: string | null;
  };
}

export interface PublicListingCard {
  slot: "problem" | "solution" | "traction";
  title: string;
  body: string;
}

/* ── Pure helpers (unit-tested) ───────────────────────────────────────────── */

/**
 * Extract the founder's one-line pitch from the interview answers, falling
 * back to the project description or a generated tagline. Pure — no I/O.
 */
export function extractOneLinePitch(
  answers: readonly InterviewAnswerRow[],
  project: Pick<ProjectPublicRow, "name" | "description" | "industry">,
): string {
  const pitch = answers.find((a) => a.step_key === "one_line_pitch");
  const trimmed = pitch?.answer_text.trim();
  if (trimmed) return trimmed;
  if (project.description?.trim()) return project.description.trim();
  const suffix = project.industry ? ` — building in ${project.industry}` : "";
  return `${project.name}${suffix}`;
}

/**
 * Turn the first three interview answers into the Problem / Solution /
 * Traction card layout the hero uses. Missing answers are omitted so the
 * page renders 0, 1, 2 or 3 cards depending on how far the founder is.
 * Pure — no I/O.
 */
export function extractCards(
  answers: readonly InterviewAnswerRow[],
): PublicListingCard[] {
  const map = new Map(answers.map((a) => [a.step_key, a.answer_text.trim()]));
  const cards: PublicListingCard[] = [];
  const problem = map.get("problem");
  if (problem)
    cards.push({ slot: "problem", title: "The problem", body: problem });
  const solution = map.get("solution");
  if (solution)
    cards.push({ slot: "solution", title: "Our solution", body: solution });
  const traction = map.get("traction");
  if (traction)
    cards.push({ slot: "traction", title: "Traction so far", body: traction });
  return cards;
}

export type SviBand = "seed" | "growth" | "scale" | "unicorn";

/**
 * Simple band bucket used by the SVI badge — mirrors the Nikkei-style
 * uncapped index by clamping cutoffs. Pure — no I/O. Matches the coarse
 * bucketing surfaced elsewhere (see lib/journey-map.ts for the fine-grained
 * 12-phase version).
 */
export function bandForSvi(total: number | null): SviBand {
  const value = typeof total === "number" && Number.isFinite(total) ? total : 0;
  if (value >= 800) return "unicorn";
  if (value >= 600) return "scale";
  if (value >= 400) return "growth";
  return "seed";
}

export function labelForBand(band: SviBand): string {
  switch (band) {
    case "unicorn":
      return "Unicorn candidate";
    case "scale":
      return "Scale stage";
    case "growth":
      return "Growth stage";
    case "seed":
    default:
      return "Seed / early";
  }
}

/**
 * Coerce a raw pct_reserved column (0-100) into a display %, clamped to
 * the platform floor of 10% (min DB-first reservation per plan §Ship1).
 * Pure — no I/O.
 */
export function displayPct(raw: number | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(10, Math.min(100, Math.round(n)));
}

/**
 * Choose the 3-6 char ticker to render in the reserved-allocation strip.
 * Falls back through: DB ticker_hint → project.package_ticker → derived
 * from project name → "COMPANY". Pure — no I/O.
 */
export function tickerFor(
  reserved: Pick<ReservedAllocationRow, "ticker_hint"> | null,
  project: Pick<ProjectPublicRow, "package_ticker" | "name">,
): string {
  const raw =
    reserved?.ticker_hint ??
    project.package_ticker ??
    project.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);
  return cleaned || "COMPANY";
}

/**
 * Build a 240-char excerpt for a public report card. Strips markdown
 * headings, bullets and links so the excerpt reads cleanly as inline
 * prose. Pure — no I/O.
 */
export function reportExcerpt(row: AssembledReportRow): string {
  const source = row.executive_summary?.trim() || row.full_markdown?.trim() || "";
  const stripped = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= 240) return stripped;
  return stripped.slice(0, 237).trimEnd() + "…";
}

/**
 * Decide whether the "Contact founder" CTA uses a mailto: link (when the
 * founder has opted-in to a public email) or falls back to the form
 * (/api/startup/[slug]/contact). Pure — no I/O.
 */
export function buildContactCta(
  contact: FounderContactRow | null,
  slug: string,
): PublicListingPayload["contact"] {
  const displayName = contact?.display_name ?? null;
  if (contact?.public_contact_opt_in && contact.email) {
    return {
      kind: "mailto",
      href: `mailto:${contact.email}?subject=BlockID%20listing%20%E2%80%94%20${encodeURIComponent(slug)}`,
      displayName,
    };
  }
  return {
    kind: "form",
    href: `/api/startup/${encodeURIComponent(slug)}/contact`,
    displayName,
  };
}

/* ── DB helpers (thin async wrappers) ─────────────────────────────────────── */

interface DbHandle {
  client: SupabaseClient;
}

/**
 * Grab a Supabase admin client — returns null when Supabase isn't
 * configured (marketing-site dev mode). Callers must treat null as
 * "listing not available".
 */
function dbHandle(): DbHandle | null {
  const client = getSupabaseAdmin();
  if (!client) return null;
  return { client };
}

async function readProject(
  { client }: DbHandle,
  slug: string,
): Promise<ProjectPublicRow | null> {
  const { data, error } = await client
    .from("projects")
    .select(
      "id, user_id, slug, name, description, industry, package_purchased_at, package_ticker, created_at",
    )
    .eq("slug", slug)
    .not("package_purchased_at", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProjectPublicRow;
}

async function readInterviewAnswers(
  { client }: DbHandle,
  projectId: string,
): Promise<InterviewAnswerRow[]> {
  const { data } = await client
    .from("startup_package_interview")
    .select("step_key, answer_text, char_count")
    .eq("project_id", projectId)
    .in("step_key", PUBLIC_INTERVIEW_KEYS as unknown as string[]);
  if (!Array.isArray(data)) return [];
  return data as InterviewAnswerRow[];
}

async function readPublicReports(
  { client }: DbHandle,
  projectId: string,
): Promise<AssembledReportRow[]> {
  const { data } = await client
    .from("assembled_reports")
    .select(
      "id, title, executive_summary, full_markdown, report_type, public, created_at",
    )
    .eq("project_id", projectId)
    .eq("public", true)
    .like("report_type", "package_step_%")
    .order("created_at", { ascending: false })
    .limit(6);
  if (!Array.isArray(data)) return [];
  return data as AssembledReportRow[];
}

async function readReservedAllocation(
  { client }: DbHandle,
  projectId: string,
): Promise<ReservedAllocationRow | null> {
  const { data } = await client
    .from("startup_package_reserved_allocations")
    .select("pct_reserved, ticker_hint, on_chain_token_id, opt_in_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  return data as ReservedAllocationRow;
}

async function readLatestSnapshot(
  { client }: DbHandle,
  userId: string,
  projectId: string,
): Promise<SviSnapshotRow | null> {
  // svi_snapshots is joined to svi_accounts (mig 0008 + 0036) which carries
  // project_id. We resolve via svi_accounts to keep the query cheap.
  const { data: accountRow } = await client
    .from("svi_accounts")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  const accountId = (accountRow as { id?: string } | null)?.id;
  if (!accountId) {
    // Fall back to any account owned by the same user (legacy backfill).
    const { data: legacyAcc } = await client
      .from("svi_accounts")
      .select("id")
      .eq("email", userId)
      .maybeSingle();
    if (!legacyAcc) return null;
    return readSnapshotByAccount(client, (legacyAcc as { id: string }).id);
  }
  return readSnapshotByAccount(client, accountId);
}

async function readSnapshotByAccount(
  client: SupabaseClient,
  accountId: string,
): Promise<SviSnapshotRow | null> {
  const { data } = await client
    .from("svi_snapshots")
    .select("svi_total, index_value, stage, snapshot_date")
    .eq("account_id", accountId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as SviSnapshotRow;
}

async function readFounderContact(
  { client }: DbHandle,
  userId: string,
): Promise<FounderContactRow | null> {
  const { data } = await client
    .from("app_users")
    .select("email, display_name, public_contact_opt_in")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return data as FounderContactRow;
}

/* ── Composed loader used by the page ────────────────────────────────────── */

/**
 * Load everything the public listing page needs in a single call.
 * Returns null when:
 *   - Supabase isn't configured, OR
 *   - the project row doesn't exist / isn't published, OR
 *   - no public interview answers have been surfaced yet.
 * The page maps null → notFound().
 */
export async function loadPublicListing(
  slug: string,
): Promise<PublicListingPayload | null> {
  const db = dbHandle();
  if (!db) return null;

  const project = await readProject(db, slug);
  if (!project) return null;
  if (!project.package_purchased_at) return null;

  const [answers, reports, reserved, snapshot, contactRow] = await Promise.all([
    readInterviewAnswers(db, project.id),
    readPublicReports(db, project.id),
    readReservedAllocation(db, project.id),
    readLatestSnapshot(db, project.user_id, project.id),
    readFounderContact(db, project.user_id),
  ]);

  const cards = extractCards(answers);
  if (cards.length === 0 && reports.length === 0) return null;

  const onelinePitch = extractOneLinePitch(answers, project);
  const sviTotal = snapshot?.svi_total ?? null;
  const band = bandForSvi(sviTotal);

  return {
    project,
    hero: {
      name: project.name,
      onelinePitch,
      industry: project.industry,
    },
    cards,
    svi:
      sviTotal !== null
        ? {
            total: sviTotal,
            index: snapshot?.index_value ?? null,
            band,
            label: labelForBand(band),
          }
        : null,
    reservedAllocation: reserved
      ? {
          pctReserved: displayPct(reserved.pct_reserved),
          ticker: tickerFor(reserved, project),
          onChain: Boolean(reserved.on_chain_token_id),
          ctaLabel: "Available on request",
        }
      : null,
    publicReports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: reportExcerpt(r),
      createdAt: r.created_at,
    })),
    contact: buildContactCta(contactRow, slug),
  };
}

/**
 * Slugs to prerender at build time (top 50 by latest SVI index_value).
 * Missing DB → empty list, which is fine: everything else is ISR.
 */
export async function listTopSlugs(limit = 50): Promise<string[]> {
  const db = dbHandle();
  if (!db) return [];
  const { data } = await db.client
    .from("projects")
    .select("slug, package_purchased_at")
    .not("package_purchased_at", "is", null)
    .limit(limit);
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => (row as { slug?: string }).slug)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}
