// Listing readiness — server assembly (S29-A).
//
// Loads every stored input the pure checker (`readiness.ts`) needs for a
// project scope, keyed on the OWNER (S17-A: members read the owner's data
// through the role table, never their own):
//
//   holders           the owner's cap table for this project (`shareholders`)
//   sharePriceAud     the S26-B share price mid (`share-price-server.ts`)
//   profitLast12mAud  revenue − operating expenses over the last 12 months
//                     of categorised bank lines (`bank_transactions`, S28-C)
//                     — only when the lines span ≥ 12 months, else null
//   incorporatedAt /  the G11 grant profile (`project_grant_profiles`)
//   listed
//   profile           the founder-ticked `listing_profiles.facts` (0379)
//
// Plus the company block for the PDF (name, ABN/ACN, address — the
// FOUNDER's entity, never BlockID's) and the profile read / write helpers.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectScope } from "@/lib/projects";
import { loadSharePriceMidForScope } from "@/lib/share-price-server";
import { categoryKind, isExpenseCategory } from "@/lib/expenses/categories";
import { applyListingFactsPatch, normaliseListingFacts, type ListingProfileFacts } from "./profile";
import type { CapTableHolder, ListingFacts } from "./readiness";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ListingDb = SupabaseClient<any, any, any>;

export type ListingScope = Pick<ProjectScope, "projectId" | "ownerUserId" | "dataEmail"> & { project: { name: string; stage?: number | null; industry?: string | null } };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

/* ── Cap table ───────────────────────────────────────────────────────── */

interface ShareholderRow {
  id: string;
  account_id?: string;
  project_id?: string | null;
  name: string | null;
  role: string | null;
  shares_held: unknown;
}

export async function loadHoldersForScope(db: ListingDb, scope: ListingScope): Promise<CapTableHolder[]> {
  const { data } = await db.from("shareholders").select("id, account_id, project_id, name, role, shares_held").eq("account_id", scope.ownerUserId);
  return (((data as ShareholderRow[] | null) ?? []) as ShareholderRow[])
    .filter((h) => h && h.id && (!h.project_id || h.project_id === scope.projectId))
    .map((h) => ({ id: h.id, name: h.name ?? "", role: h.role ?? "shareholder", sharesHeld: num(h.shares_held) }));
}

/* ── Bank-line profit ─────────────────────────────────────────────────── */

export interface BankProfit {
  /** Revenue − operating expenses over the trailing 12 months ending at the latest line; null when coverage < 12 months. */
  profitLast12mAud: number | null;
  /** Whole months between the earliest and latest categorised line (0 when none). */
  coverageMonths: number;
}

interface BankLine {
  occurred_on: string;
  amount_aud: unknown;
  category: string;
}

function monthIndex(day: string): number {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return y * 12 + (m - 1);
}

/** Pure — exported for the colocated suite. Grants and neutral movements are excluded (profit from continuing operations only). */
export function bankProfitFromLines(lines: readonly BankLine[]): BankProfit {
  const dated = lines.filter((l) => typeof l.occurred_on === "string" && /^\d{4}-\d{2}-\d{2}/.test(l.occurred_on));
  if (dated.length === 0) return { profitLast12mAud: null, coverageMonths: 0 };
  let earliest = dated[0].occurred_on.slice(0, 10);
  let latest = earliest;
  for (const l of dated) {
    const d = l.occurred_on.slice(0, 10);
    if (d < earliest) earliest = d;
    if (d > latest) latest = d;
  }
  const coverageMonths = monthIndex(latest) - monthIndex(earliest) + 1;
  if (coverageMonths < 12) return { profitLast12mAud: null, coverageMonths };
  const fromIdx = monthIndex(latest) - 11;
  let revenue = 0;
  let expenses = 0;
  for (const l of dated) {
    const d = l.occurred_on.slice(0, 10);
    if (monthIndex(d) < fromIdx) continue;
    const amt = num(l.amount_aud);
    if (l.category === "revenue") revenue += Math.max(0, amt);
    else if (isExpenseCategory(l.category) && categoryKind(l.category) === "expense") expenses += Math.abs(amt);
  }
  return { profitLast12mAud: Math.round((revenue - expenses) * 100) / 100, coverageMonths };
}

export async function loadBankProfit(db: ListingDb, projectId: string): Promise<BankProfit> {
  const { data } = await db.from("bank_transactions").select("occurred_on, amount_aud, category").eq("project_id", projectId).order("occurred_on", { ascending: false }).limit(5000);
  return bankProfitFromLines(((data as BankLine[] | null) ?? []).filter((l) => l && typeof l.occurred_on === "string"));
}

/* ── Grant profile + listing profile ─────────────────────────────────── */

export interface ListingProfileRow {
  project_id: string;
  facts: unknown;
  pdf_credits_charged: unknown;
  pdf_charged_at: string | null;
  updated_at: string | null;
}

export interface ListingProfile {
  facts: ListingProfileFacts;
  pdfCreditsCharged: number;
  pdfChargedAt: string | null;
  updatedAt: string | null;
}

export async function loadListingProfile(db: ListingDb, projectId: string): Promise<ListingProfile> {
  const { data } = await db.from("listing_profiles").select("project_id, facts, pdf_credits_charged, pdf_charged_at, updated_at").eq("project_id", projectId).maybeSingle();
  const row = (data as ListingProfileRow | null) ?? null;
  if (!row || row.project_id !== projectId) return { facts: {}, pdfCreditsCharged: 0, pdfChargedAt: null, updatedAt: null };
  return { facts: normaliseListingFacts(row.facts), pdfCreditsCharged: num(row.pdf_credits_charged), pdfChargedAt: row.pdf_charged_at ?? null, updatedAt: row.updated_at ?? null };
}

/** Merge a validated patch into the stored facts (upsert). Returns the stored facts after the write, or null on failure. */
export async function saveListingFacts(db: ListingDb, projectId: string, patch: Record<string, unknown>, cleared: string[]): Promise<ListingProfileFacts | null> {
  const current = await loadListingProfile(db, projectId);
  const next = applyListingFactsPatch(current.facts, patch, cleared);
  const { error } = await db.from("listing_profiles").upsert({ project_id: projectId, facts: next, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) {
    console.error("[listing] facts upsert failed", error);
    return null;
  }
  return next;
}

/** Stamp the one-off PDF charge on the profile (charged once per project; re-downloads free). */
export async function markListingPdfCharged(db: ListingDb, projectId: string, credits: number): Promise<boolean> {
  const { error } = await db.from("listing_profiles").upsert({ project_id: projectId, pdf_credits_charged: credits, pdf_charged_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) {
    console.error("[listing] pdf charge stamp failed", error);
    return false;
  }
  return true;
}

interface GrantProfileRow {
  project_id?: string;
  incorporated_at: string | null;
  listed: boolean | null;
  abn?: string | null;
  acn?: string | null;
  city?: string | null;
  state?: string | null;
}

async function loadGrantProfile(db: ListingDb, projectId: string): Promise<GrantProfileRow | null> {
  const { data } = await db.from("project_grant_profiles").select("project_id, incorporated_at, listed, abn, acn, city, state").eq("project_id", projectId).maybeSingle();
  const row = (data as GrantProfileRow | null) ?? null;
  return row && (!row.project_id || row.project_id === projectId) ? row : null;
}

/* ── Company block (the founder's entity) ────────────────────────────── */

export interface ListingCompany {
  name: string;
  abn: string | null;
  acn: string | null;
  address: string | null;
}

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function formatAbn(v: string | null | undefined): string | null {
  const d = digits(v);
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : null;
}

export function formatAcn(v: string | null | undefined): string | null {
  const d = digits(v);
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null;
}

function companyFromGrant(name: string, g: GrantProfileRow | null): ListingCompany {
  const address = [g?.city, g?.state].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" ");
  return { name, abn: formatAbn(g?.abn), acn: formatAcn(g?.acn), address: address || null };
}

/* ── Assembly ────────────────────────────────────────────────────────── */

export interface ListingFactsForScope {
  facts: ListingFacts;
  company: ListingCompany;
  profile: ListingProfile;
}

export async function loadListingFactsForScope(db: ListingDb, scope: ListingScope, caller: { email: string }): Promise<ListingFactsForScope> {
  const [holders, sharePriceAud, bank, grant, profile] = await Promise.all([
    loadHoldersForScope(db, scope),
    loadSharePriceMidForScope(db, scope, caller),
    loadBankProfit(db, scope.projectId),
    loadGrantProfile(db, scope.projectId),
    loadListingProfile(db, scope.projectId),
  ]);
  return {
    facts: {
      holders,
      sharePriceAud,
      profitLast12mAud: bank.profitLast12mAud,
      profitCoverageMonths: bank.coverageMonths,
      incorporatedAt: grant?.incorporated_at ?? null,
      listed: grant ? Boolean(grant.listed) : null,
      profile: profile.facts,
    },
    company: companyFromGrant(scope.project.name, grant),
    profile,
  };
}
