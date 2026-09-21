// Program intake links (G14 S35, migration 0405).
//
// An evaluator (Firm / Program / Fund / any Programs rung — feature flag
// `intake.manage`, D5) creates an intake link; founders apply at
// /apply/<slug> and land in the evaluator's scored inbox. This module is
// the CRUD + rules layer over `program_intakes` / `intake_submissions`:
//
//   * slug = kebab(name) (≤ 40 chars) + "-" + 8 random base32 chars — the
//     URL is the only "credential" a public page has, so it is unguessable
//     (D2) and UNIQUE in the table;
//   * acceptance rules (`intakeAcceptance`) — status, opens_at / closes_at
//     window, max_submissions — are pure so the public page, the submit
//     route and the runner agree;
//   * every reader tolerates a missing table (42P01 → "not migrated", the
//     0314 pattern): the inbox renders its empty state and the public page
//     404s until 0405 is applied.
//
// Persistence goes through `IntakeStore` (Supabase admin by default) so the
// colocated test runs against an in-memory store. No `server-only` here for
// the same reason; the Supabase client is imported lazily.

import { randomBytes } from "node:crypto";

export const INTAKE_STATUSES = ["open", "closed"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const SUBMISSION_STATUSES = ["received", "scored", "reviewed", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const DEFAULT_MAX_SUBMISSIONS = 200;
export const MAX_MAX_SUBMISSIONS = 5_000;
export const SLUG_SUFFIX_LENGTH = 8;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;

export interface ProgramIntake {
  id: string;
  ownerUserId: string;
  orgId: string | null;
  slug: string;
  name: string;
  blurb: string | null;
  opensAt: string | null;
  closesAt: string | null;
  maxSubmissions: number;
  autoReport: boolean;
  status: IntakeStatus;
  /** G21 P2-A (0422): the intake_templates row the public form renders; null = the fixed form. */
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeSubmission {
  id: string;
  intakeId: string;
  evaluationId: string | null;
  projectId: string | null;
  founderEmail: string;
  founderName: string | null;
  startupName: string;
  website: string | null;
  deckStoragePath: string | null;
  pitchdeckAnalysisId: string | null;
  status: SubmissionStatus;
  sviTotal: number | null;
  coverage: Record<string, { level?: string; excerpt?: string }> | null;
  warnings: string[];
  /** G21 P2-A (0422): template answers {question_key: value}; {} for the fixed form. */
  answers: Record<string, string | number>;
  submittedAt: string;
}

export interface IntakeWithCounts extends ProgramIntake {
  submissionCount: number;
  publicUrl: string;
}

/** One inbox row — the submission + what the table needs from the intake / snapshot. */
export interface InboxRow extends IntakeSubmission {
  intakeName: string;
  intakeSlug: string;
  /** Latest svi_snapshots.svi_total for the project (wins over the denormalised column). */
  latestSvi: number | null;
  dossierUrl: string | null;
}

export type IntakeStoreErrorCode = "not_migrated" | "duplicate" | "service_unavailable" | "db_error";

export class IntakeStoreError extends Error {
  code: IntakeStoreErrorCode;
  constructor(code: IntakeStoreErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export function kebab(name: string, max = 40): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "program"
  );
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function randomSuffix(length = SLUG_SUFFIX_LENGTH, rng: () => Buffer = () => randomBytes(length)): string {
  const bytes = rng();
  let out = "";
  for (let i = 0; i < length; i += 1) out += BASE32[(bytes[i] ?? 0) % 32];
  return out;
}

/** `kebab(name)-<8 random chars>` — always matches SLUG_RE. */
export function makeSlug(name: string, suffix: string = randomSuffix()): string {
  const slug = `${kebab(name)}-${suffix}`;
  if (!SLUG_RE.test(slug)) throw new Error(`slug_invalid: ${slug}`);
  return slug;
}

export function isIntakeSlug(v: unknown): v is string {
  return typeof v === "string" && SLUG_RE.test(v);
}

export type IntakeRejection = "closed" | "not_open_yet" | "window_closed" | "full";

export type IntakeAcceptance = { ok: true; remaining: number } | { ok: false; reason: IntakeRejection };

/** Pure: may this intake accept one more submission right now? */
export function intakeAcceptance(
  intake: Pick<ProgramIntake, "status" | "opensAt" | "closesAt" | "maxSubmissions">,
  submissionCount: number,
  now: Date = new Date(),
): IntakeAcceptance {
  if (intake.status !== "open") return { ok: false, reason: "closed" };
  const t = now.getTime();
  if (intake.opensAt) {
    const opens = Date.parse(intake.opensAt);
    if (Number.isFinite(opens) && t < opens) return { ok: false, reason: "not_open_yet" };
  }
  if (intake.closesAt) {
    const closes = Date.parse(intake.closesAt);
    if (Number.isFinite(closes) && t >= closes) return { ok: false, reason: "window_closed" };
  }
  const remaining = intake.maxSubmissions - submissionCount;
  if (remaining <= 0) return { ok: false, reason: "full" };
  return { ok: true, remaining };
}

export interface CreateIntakeInput {
  name?: unknown;
  blurb?: unknown;
  opens_at?: unknown;
  closes_at?: unknown;
  max_submissions?: unknown;
  auto_report?: unknown;
  /** G21 P2-A: intake_templates.id (uuid) or null / absent for the fixed form. */
  template_id?: unknown;
}

export interface NormalisedIntakeInput {
  name: string;
  blurb: string | null;
  opensAt: string | null;
  closesAt: string | null;
  maxSubmissions: number;
  autoReport: boolean;
  templateId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoOrNull(v: unknown, field: string): { ok: true; value: string | null } | { ok: false; message: string } {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, message: `${field} must be an ISO date` };
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return { ok: false, message: `${field} must be an ISO date` };
  return { ok: true, value: new Date(t).toISOString() };
}

export function normaliseIntakeInput(raw: CreateIntakeInput): { ok: true; value: NormalisedIntakeInput } | { ok: false; message: string } {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, message: "Program name is required" };
  if (name.length > 120) return { ok: false, message: "Program name must be under 120 characters" };
  const blurb = typeof raw.blurb === "string" && raw.blurb.trim() ? raw.blurb.trim().slice(0, 1000) : null;
  const opens = isoOrNull(raw.opens_at, "opens_at");
  if (!opens.ok) return opens;
  const closes = isoOrNull(raw.closes_at, "closes_at");
  if (!closes.ok) return closes;
  if (opens.value && closes.value && Date.parse(closes.value) <= Date.parse(opens.value)) {
    return { ok: false, message: "closes_at must be after opens_at" };
  }
  let maxSubmissions = DEFAULT_MAX_SUBMISSIONS;
  if (raw.max_submissions != null && raw.max_submissions !== "") {
    const n = Number(raw.max_submissions);
    if (!Number.isInteger(n) || n < 1 || n > MAX_MAX_SUBMISSIONS) {
      return { ok: false, message: `max_submissions must be a whole number between 1 and ${MAX_MAX_SUBMISSIONS}` };
    }
    maxSubmissions = n;
  }
  // F-4: auto_report defaults OFF — only an explicit boolean true turns it on.
  const autoReport = raw.auto_report === true;
  let templateId: string | null = null;
  if (raw.template_id != null && raw.template_id !== "") {
    if (typeof raw.template_id !== "string" || !UUID_RE.test(raw.template_id)) return { ok: false, message: "template_id must be a template id" };
    templateId = raw.template_id;
  }
  return { ok: true, value: { name, blurb, opensAt: opens.value, closesAt: closes.value, maxSubmissions, autoReport, templateId } };
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

export function publicUrlForSlug(slug: string, base = siteUrl()): string {
  return `${base}/apply/${slug}`;
}

export function dossierUrlFor(evaluationId: string | null): string | null {
  return evaluationId ? `/workspace/evaluations/${evaluationId}` : null;
}

// ── Row mapping ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : v == null ? null : String(v));
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const INTAKE_COLUMNS =
  "id, owner_user_id, org_id, slug, name, blurb, opens_at, closes_at, max_submissions, auto_report, status, created_at, updated_at";
export const SUBMISSION_COLUMNS =
  "id, intake_id, evaluation_id, project_id, founder_email, founder_name, startup_name, website, deck_storage_path, pitchdeck_analysis_id, status, svi_total, coverage, warnings, submitted_at";
/** G21 P2-A (0422) — readers try these first and fall back on 42703 until the migration is applied. */
export const INTAKE_COLUMNS_V2 = `${INTAKE_COLUMNS}, template_id`;
export const SUBMISSION_COLUMNS_V2 = `${SUBMISSION_COLUMNS}, answers`;

function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703";
}

/** Run a read with the 0422 columns, retrying with the 0405 shape when a column is missing. */
async function withColumns<T extends { error: { code?: string } | null }>(v2: string, v1: string, run: (cols: string) => PromiseLike<T>): Promise<T> {
  const res = await run(v2);
  if (res.error && isMissingColumn(res.error)) return run(v1);
  return res;
}

function mapAnswers(raw: unknown): Record<string, string | number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

export function mapIntakeRow(row: Row): ProgramIntake {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    orgId: str(row.org_id),
    slug: String(row.slug),
    name: String(row.name ?? ""),
    blurb: str(row.blurb),
    opensAt: str(row.opens_at),
    closesAt: str(row.closes_at),
    maxSubmissions: num(row.max_submissions) ?? DEFAULT_MAX_SUBMISSIONS,
    autoReport: row.auto_report === true,
    status: row.status === "closed" ? "closed" : "open",
    templateId: str(row.template_id),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function mapSubmissionRow(row: Row): IntakeSubmission {
  const status = (SUBMISSION_STATUSES as readonly string[]).includes(String(row.status)) ? (row.status as SubmissionStatus) : "received";
  return {
    id: String(row.id),
    intakeId: String(row.intake_id),
    evaluationId: str(row.evaluation_id),
    projectId: str(row.project_id),
    founderEmail: String(row.founder_email ?? ""),
    founderName: str(row.founder_name),
    startupName: String(row.startup_name ?? ""),
    website: str(row.website),
    deckStoragePath: str(row.deck_storage_path),
    pitchdeckAnalysisId: str(row.pitchdeck_analysis_id),
    status,
    sviTotal: num(row.svi_total),
    coverage: row.coverage && typeof row.coverage === "object" ? (row.coverage as IntakeSubmission["coverage"]) : null,
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    answers: mapAnswers(row.answers),
    submittedAt: String(row.submitted_at ?? ""),
  };
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface IntakeInsert {
  ownerUserId: string;
  /** G22-B (0433): the organisation the creator acts for; null / absent = not stamped. */
  orgId?: string | null;
  slug: string;
  name: string;
  blurb: string | null;
  opensAt: string | null;
  closesAt: string | null;
  maxSubmissions: number;
  autoReport: boolean;
  templateId?: string | null;
}

export interface SubmissionInsert {
  intakeId: string;
  founderEmail: string;
  founderName: string | null;
  startupName: string;
  website: string | null;
  deckStoragePath: string | null;
  ipHash: string | null;
  /** G21 P2-A: template answers (dropped on the 0405-only shape). */
  answers?: Record<string, string | number> | null;
}

export interface SubmissionPatch {
  evaluationId?: string | null;
  projectId?: string | null;
  pitchdeckAnalysisId?: string | null;
  status?: SubmissionStatus;
  sviTotal?: number | null;
  coverage?: IntakeSubmission["coverage"];
  warnings?: string[];
}

export interface IntakeStore {
  insertIntake(row: IntakeInsert): Promise<ProgramIntake>;
  getIntakeBySlug(slug: string): Promise<ProgramIntake | null>;
  getIntakeForOwner(ownerUserId: string, intakeId: string): Promise<ProgramIntake | null>;
  listIntakesForOwner(ownerUserId: string): Promise<ProgramIntake[]>;
  updateIntake(intakeId: string, patch: Partial<Pick<ProgramIntake, "status" | "autoReport" | "name" | "blurb" | "closesAt" | "templateId">>): Promise<void>;
  countSubmissions(intakeIds: readonly string[]): Promise<Map<string, number>>;
  findSubmission(intakeId: string, founderEmail: string): Promise<IntakeSubmission | null>;
  insertSubmission(row: SubmissionInsert): Promise<IntakeSubmission>;
  updateSubmission(submissionId: string, patch: SubmissionPatch): Promise<void>;
  listSubmissions(intakeIds: readonly string[]): Promise<IntakeSubmission[]>;
  /** Latest svi_snapshots.svi_total per project id (decorative — never throws). */
  latestSviByProject(projectIds: readonly string[]): Promise<Map<string, number>>;
  /** Best-effort `evaluations.intake_id` backlink (column may not exist yet). */
  linkEvaluationToIntake(evaluationId: string, intakeId: string): Promise<boolean>;
}

function toStoreError(error: { code?: string; message?: string } | null | undefined): IntakeStoreError {
  const code = error?.code ?? "";
  if (code === "42P01") return new IntakeStoreError("not_migrated", "migration 0405 not applied");
  if (code === "23505") return new IntakeStoreError("duplicate", error?.message);
  return new IntakeStoreError("db_error", error?.message ?? "db_error");
}

function intakeToRow(row: IntakeInsert, withTemplate = true): Row {
  return {
    owner_user_id: row.ownerUserId,
    // org_id is a 0405 column (0433 adds the FK + index), so it needs no 42703 fallback of its own.
    ...(row.orgId ? { org_id: row.orgId } : {}),
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    opens_at: row.opensAt,
    closes_at: row.closesAt,
    max_submissions: row.maxSubmissions,
    auto_report: row.autoReport,
    status: "open",
    ...(withTemplate && row.templateId ? { template_id: row.templateId } : {}),
  };
}

function patchToRow(patch: SubmissionPatch): Row {
  const out: Row = {};
  if ("evaluationId" in patch) out.evaluation_id = patch.evaluationId ?? null;
  if ("projectId" in patch) out.project_id = patch.projectId ?? null;
  if ("pitchdeckAnalysisId" in patch) out.pitchdeck_analysis_id = patch.pitchdeckAnalysisId ?? null;
  if (patch.status) out.status = patch.status;
  if ("sviTotal" in patch) out.svi_total = patch.sviTotal ?? null;
  if ("coverage" in patch) out.coverage = patch.coverage ?? null;
  if (patch.warnings) out.warnings = patch.warnings;
  return out;
}

/** Supabase-admin implementation. Null when the service key is missing. */
export async function supabaseIntakeStore(): Promise<IntakeStore | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  return {
    async insertIntake(row) {
      let res = await supabase.from("program_intakes").insert(intakeToRow(row)).select(INTAKE_COLUMNS_V2).single();
      if (res.error && isMissingColumn(res.error)) res = await supabase.from("program_intakes").insert(intakeToRow(row, false)).select(INTAKE_COLUMNS).single();
      const { data, error } = res;
      if (error || !data) throw toStoreError(error);
      return mapIntakeRow(data as unknown as Row);
    },
    async getIntakeBySlug(slug) {
      const { data, error } = await withColumns(INTAKE_COLUMNS_V2, INTAKE_COLUMNS, (cols) => supabase.from("program_intakes").select(cols).eq("slug", slug).maybeSingle());
      if (error) throw toStoreError(error);
      return data ? mapIntakeRow(data as unknown as Row) : null;
    },
    async getIntakeForOwner(ownerUserId, intakeId) {
      const { data, error } = await withColumns(INTAKE_COLUMNS_V2, INTAKE_COLUMNS, (cols) =>
        supabase.from("program_intakes").select(cols).eq("id", intakeId).eq("owner_user_id", ownerUserId).maybeSingle(),
      );
      if (error) throw toStoreError(error);
      return data ? mapIntakeRow(data as unknown as Row) : null;
    },
    async listIntakesForOwner(ownerUserId) {
      const { data, error } = await withColumns(INTAKE_COLUMNS_V2, INTAKE_COLUMNS, (cols) =>
        supabase.from("program_intakes").select(cols).eq("owner_user_id", ownerUserId).order("created_at", { ascending: false }).limit(200),
      );
      if (error) throw toStoreError(error);
      return ((data ?? []) as unknown as Row[]).map(mapIntakeRow);
    },
    async updateIntake(intakeId, patch) {
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.status) row.status = patch.status;
      if (patch.autoReport != null) row.auto_report = patch.autoReport;
      if (patch.name != null) row.name = patch.name;
      if ("blurb" in patch) row.blurb = patch.blurb ?? null;
      if ("closesAt" in patch) row.closes_at = patch.closesAt ?? null;
      if ("templateId" in patch) row.template_id = patch.templateId ?? null;
      const { error } = await supabase.from("program_intakes").update(row).eq("id", intakeId);
      if (error) throw toStoreError(error);
    },
    async countSubmissions(intakeIds) {
      const out = new Map<string, number>();
      if (!intakeIds.length) return out;
      const { data, error } = await supabase.from("intake_submissions").select("intake_id").in("intake_id", [...intakeIds]);
      if (error) throw toStoreError(error);
      for (const r of (data ?? []) as Row[]) {
        const id = String(r.intake_id);
        out.set(id, (out.get(id) ?? 0) + 1);
      }
      return out;
    },
    async findSubmission(intakeId, founderEmail) {
      const { data, error } = await withColumns(SUBMISSION_COLUMNS_V2, SUBMISSION_COLUMNS, (cols) =>
        supabase.from("intake_submissions").select(cols).eq("intake_id", intakeId).eq("founder_email", founderEmail).maybeSingle(),
      );
      if (error) throw toStoreError(error);
      return data ? mapSubmissionRow(data as unknown as Row) : null;
    },
    async insertSubmission(row) {
      const base: Row = {
        intake_id: row.intakeId,
        founder_email: row.founderEmail,
        founder_name: row.founderName,
        startup_name: row.startupName,
        website: row.website,
        deck_storage_path: row.deckStoragePath,
        ip_hash: row.ipHash,
        status: "received",
      };
      const withAnswers = row.answers && Object.keys(row.answers).length > 0;
      let res = await supabase
        .from("intake_submissions")
        .insert(withAnswers ? { ...base, answers: row.answers } : base)
        .select(withAnswers ? SUBMISSION_COLUMNS_V2 : SUBMISSION_COLUMNS)
        .single();
      if (res.error && isMissingColumn(res.error)) res = await supabase.from("intake_submissions").insert(base).select(SUBMISSION_COLUMNS).single();
      const { data, error } = res;
      if (error || !data) throw toStoreError(error);
      return mapSubmissionRow(data as unknown as Row);
    },
    async updateSubmission(submissionId, patch) {
      const { error } = await supabase.from("intake_submissions").update(patchToRow(patch)).eq("id", submissionId);
      if (error) throw toStoreError(error);
    },
    async listSubmissions(intakeIds) {
      if (!intakeIds.length) return [];
      const { data, error } = await withColumns(SUBMISSION_COLUMNS_V2, SUBMISSION_COLUMNS, (cols) =>
        supabase.from("intake_submissions").select(cols).in("intake_id", [...intakeIds]).order("submitted_at", { ascending: false }).limit(2_000),
      );
      if (error) throw toStoreError(error);
      return ((data ?? []) as unknown as Row[]).map(mapSubmissionRow);
    },
    async latestSviByProject(projectIds) {
      const out = new Map<string, number>();
      if (!projectIds.length) return out;
      try {
        const { data, error } = await supabase
          .from("svi_snapshots")
          .select("project_id, svi_total, created_at")
          .in("project_id", [...projectIds])
          .order("created_at", { ascending: false })
          .limit(projectIds.length * 5);
        if (error || !data) return out;
        for (const r of data as Row[]) {
          const pid = str(r.project_id);
          if (!pid || out.has(pid)) continue;
          const svi = num(r.svi_total);
          if (svi != null) out.set(pid, svi);
        }
      } catch {
        /* decorative */
      }
      return out;
    },
    async linkEvaluationToIntake(evaluationId, intakeId) {
      try {
        const { error } = await supabase.from("evaluations").update({ intake_id: intakeId }).eq("id", evaluationId);
        return !error;
      } catch {
        return false;
      }
    },
  };
}

export interface IntakeDeps {
  store?: IntakeStore | null;
  now?: Date;
  /** Injectable for deterministic slugs in tests. */
  suffix?: () => string;
  /**
   * G22-B (0433) — `createIntake` only: the investor_organisations row the
   * creator acts for, resolved by the CALLER with `resolveActingOrg(user.id)`
   * (the route / the pilot service) — never taken from the request body.
   * Absent or null = the row is not stamped (retention / audit export then
   * fall back to owner-owned rows).
   */
  orgId?: string | null;
}

async function resolveStore(deps: IntakeDeps): Promise<IntakeStore> {
  const store = deps.store === undefined ? await supabaseIntakeStore() : deps.store;
  if (!store) throw new IntakeStoreError("service_unavailable", "Supabase not configured");
  return store;
}

// ── Owner-side API ──────────────────────────────────────────────────────────

export type CreateIntakeResult =
  | { ok: true; intake: IntakeWithCounts }
  | { ok: false; error: "invalid_input" | IntakeStoreErrorCode; message: string };

/** Create an intake link; retries the random suffix on a (vanishingly rare) slug collision. */
export async function createIntake(ownerUserId: string, raw: CreateIntakeInput, deps: IntakeDeps = {}): Promise<CreateIntakeResult> {
  const parsed = normaliseIntakeInput(raw);
  if (!parsed.ok) return { ok: false, error: "invalid_input", message: parsed.message };
  const input = parsed.value;
  try {
    const store = await resolveStore(deps);
    let lastErr: IntakeStoreError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = makeSlug(input.name, deps.suffix ? deps.suffix() : undefined);
      try {
        const intake = await store.insertIntake({ ownerUserId, orgId: deps.orgId ?? null, slug, ...input });
        return { ok: true, intake: { ...intake, submissionCount: 0, publicUrl: publicUrlForSlug(intake.slug) } };
      } catch (err) {
        if (err instanceof IntakeStoreError && err.code === "duplicate") {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    return { ok: false, error: "db_error", message: lastErr?.message ?? "slug collision" };
  } catch (err) {
    if (err instanceof IntakeStoreError) return { ok: false, error: err.code, message: err.message };
    console.error("[blockid:intake] create failed", err);
    return { ok: false, error: "db_error", message: "Failed to create the intake link" };
  }
}

/** The evaluator's intakes, newest first, with submission counts. `[]` when 0405 is not applied. */
export async function listMyIntakes(ownerUserId: string, deps: IntakeDeps = {}): Promise<IntakeWithCounts[]> {
  try {
    const store = await resolveStore(deps);
    const intakes = await store.listIntakesForOwner(ownerUserId);
    const counts = await store.countSubmissions(intakes.map((i) => i.id));
    return intakes.map((i) => ({ ...i, submissionCount: counts.get(i.id) ?? 0, publicUrl: publicUrlForSlug(i.slug) }));
  } catch (err) {
    if (!(err instanceof IntakeStoreError && (err.code === "not_migrated" || err.code === "service_unavailable"))) {
      console.error("[blockid:intake] list failed", err);
    }
    return [];
  }
}

export async function getMyIntake(ownerUserId: string, intakeId: string, deps: IntakeDeps = {}): Promise<ProgramIntake | null> {
  try {
    const store = await resolveStore(deps);
    return await store.getIntakeForOwner(ownerUserId, intakeId);
  } catch {
    return null;
  }
}

export async function setIntakeStatus(
  ownerUserId: string,
  intakeId: string,
  status: IntakeStatus,
  deps: IntakeDeps = {},
): Promise<{ ok: true; intake: ProgramIntake } | { ok: false; error: "not_found" | IntakeStoreErrorCode }> {
  try {
    const store = await resolveStore(deps);
    const intake = await store.getIntakeForOwner(ownerUserId, intakeId);
    if (!intake) return { ok: false, error: "not_found" };
    await store.updateIntake(intake.id, { status });
    return { ok: true, intake: { ...intake, status } };
  } catch (err) {
    if (err instanceof IntakeStoreError) return { ok: false, error: err.code };
    return { ok: false, error: "db_error" };
  }
}

export async function setSubmissionStatus(
  ownerUserId: string,
  submissionId: string,
  status: SubmissionStatus,
  deps: IntakeDeps = {},
): Promise<{ ok: true } | { ok: false; error: "not_found" | IntakeStoreErrorCode }> {
  try {
    const store = await resolveStore(deps);
    const intakes = await store.listIntakesForOwner(ownerUserId);
    const rows = await store.listSubmissions(intakes.map((i) => i.id));
    const row = rows.find((r) => r.id === submissionId);
    if (!row) return { ok: false, error: "not_found" };
    await store.updateSubmission(row.id, { status });
    return { ok: true };
  } catch (err) {
    if (err instanceof IntakeStoreError) return { ok: false, error: err.code };
    return { ok: false, error: "db_error" };
  }
}

/**
 * Every submission across the evaluator's intakes (optionally one intake),
 * newest first, with the latest SVI snapshot folded in. A `received` row
 * whose project has since been scored (the evaluator clicked "Score now"
 * in the dossier) reads as `scored`.
 */
export async function listInboxRows(ownerUserId: string, opts: { intakeId?: string | null } & IntakeDeps = {}): Promise<InboxRow[]> {
  try {
    const store = await resolveStore(opts);
    const intakes = (await store.listIntakesForOwner(ownerUserId)).filter((i) => !opts.intakeId || i.id === opts.intakeId);
    if (!intakes.length) return [];
    const byId = new Map(intakes.map((i) => [i.id, i]));
    const rows = await store.listSubmissions(intakes.map((i) => i.id));
    const snapshots = await store.latestSviByProject(rows.map((r) => r.projectId).filter((p): p is string => Boolean(p)));
    return rows.map((r) => {
      const intake = byId.get(r.intakeId);
      const latest = r.projectId ? (snapshots.get(r.projectId) ?? null) : null;
      const svi = latest ?? r.sviTotal;
      const status: SubmissionStatus = r.status === "received" && svi != null ? "scored" : r.status;
      return {
        ...r,
        status,
        intakeName: intake?.name ?? "",
        intakeSlug: intake?.slug ?? "",
        latestSvi: svi,
        dossierUrl: dossierUrlFor(r.evaluationId),
      };
    });
  } catch (err) {
    if (!(err instanceof IntakeStoreError && (err.code === "not_migrated" || err.code === "service_unavailable"))) {
      console.error("[blockid:intake] inbox failed", err);
    }
    return [];
  }
}

// ── Public side ─────────────────────────────────────────────────────────────

export type PublicIntakeLookup =
  | { ok: true; intake: ProgramIntake; acceptance: IntakeAcceptance }
  | { ok: false; error: "not_found" | "not_migrated" | "service_unavailable" };

/** The /apply/<slug> page + submit route: 404 for unknown / not migrated; acceptance carries the reason when closed. */
export async function lookupPublicIntake(slug: string, deps: IntakeDeps = {}): Promise<PublicIntakeLookup> {
  if (!isIntakeSlug(slug)) return { ok: false, error: "not_found" };
  try {
    const store = await resolveStore(deps);
    const intake = await store.getIntakeBySlug(slug);
    if (!intake) return { ok: false, error: "not_found" };
    const counts = await store.countSubmissions([intake.id]);
    return { ok: true, intake, acceptance: intakeAcceptance(intake, counts.get(intake.id) ?? 0, deps.now) };
  } catch (err) {
    if (err instanceof IntakeStoreError && (err.code === "not_migrated" || err.code === "service_unavailable")) {
      return { ok: false, error: err.code };
    }
    console.error("[blockid:intake] lookup failed", err);
    return { ok: false, error: "service_unavailable" };
  }
}

// ── In-memory store (tests + the runner's colocated test) ───────────────────

/** Deterministic in-memory `IntakeStore`; `migrated: false` throws 42P01-shaped errors. */
export function memoryIntakeStore(opts: { migrated?: boolean; snapshots?: Record<string, number> } = {}): IntakeStore & {
  intakes: ProgramIntake[];
  submissions: IntakeSubmission[];
  links: Array<{ evaluationId: string; intakeId: string }>;
} {
  const migrated = opts.migrated !== false;
  const guard = () => {
    if (!migrated) throw new IntakeStoreError("not_migrated");
  };
  let seq = 0;
  const nowIso = () => new Date().toISOString();
  const state = {
    intakes: [] as ProgramIntake[],
    submissions: [] as IntakeSubmission[],
    links: [] as Array<{ evaluationId: string; intakeId: string }>,
  };
  return {
    ...state,
    async insertIntake(row) {
      guard();
      if (state.intakes.some((i) => i.slug === row.slug)) throw new IntakeStoreError("duplicate", "slug");
      const intake: ProgramIntake = {
        id: `intake-${++seq}`,
        ownerUserId: row.ownerUserId,
        orgId: row.orgId ?? null,
        slug: row.slug,
        name: row.name,
        blurb: row.blurb,
        opensAt: row.opensAt,
        closesAt: row.closesAt,
        maxSubmissions: row.maxSubmissions,
        autoReport: row.autoReport,
        status: "open",
        templateId: row.templateId ?? null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.intakes.push(intake);
      return { ...intake };
    },
    async getIntakeBySlug(slug) {
      guard();
      const i = state.intakes.find((x) => x.slug === slug);
      return i ? { ...i } : null;
    },
    async getIntakeForOwner(ownerUserId, intakeId) {
      guard();
      const i = state.intakes.find((x) => x.id === intakeId && x.ownerUserId === ownerUserId);
      return i ? { ...i } : null;
    },
    async listIntakesForOwner(ownerUserId) {
      guard();
      return state.intakes.filter((x) => x.ownerUserId === ownerUserId).map((x) => ({ ...x })).reverse();
    },
    async updateIntake(intakeId, patch) {
      guard();
      const i = state.intakes.find((x) => x.id === intakeId);
      if (i) Object.assign(i, patch, { updatedAt: nowIso() });
    },
    async countSubmissions(intakeIds) {
      guard();
      const out = new Map<string, number>();
      for (const s of state.submissions) if (intakeIds.includes(s.intakeId)) out.set(s.intakeId, (out.get(s.intakeId) ?? 0) + 1);
      return out;
    },
    async findSubmission(intakeId, founderEmail) {
      guard();
      const s = state.submissions.find((x) => x.intakeId === intakeId && x.founderEmail === founderEmail);
      return s ? { ...s } : null;
    },
    async insertSubmission(row) {
      guard();
      if (state.submissions.some((x) => x.intakeId === row.intakeId && x.founderEmail === row.founderEmail)) {
        throw new IntakeStoreError("duplicate", "intake_submissions_intake_id_founder_email_key");
      }
      const s: IntakeSubmission = {
        id: `sub-${++seq}`,
        intakeId: row.intakeId,
        evaluationId: null,
        projectId: null,
        founderEmail: row.founderEmail,
        founderName: row.founderName,
        startupName: row.startupName,
        website: row.website,
        deckStoragePath: row.deckStoragePath,
        pitchdeckAnalysisId: null,
        status: "received",
        sviTotal: null,
        coverage: null,
        warnings: [],
        answers: row.answers ?? {},
        submittedAt: nowIso(),
      };
      state.submissions.push(s);
      return { ...s };
    },
    async updateSubmission(submissionId, patch) {
      guard();
      const s = state.submissions.find((x) => x.id === submissionId);
      if (s) Object.assign(s, patch);
    },
    async listSubmissions(intakeIds) {
      guard();
      return state.submissions.filter((x) => intakeIds.includes(x.intakeId)).map((x) => ({ ...x })).reverse();
    },
    async latestSviByProject(projectIds) {
      const out = new Map<string, number>();
      for (const p of projectIds) if (opts.snapshots && p in opts.snapshots) out.set(p, opts.snapshots[p]!);
      return out;
    },
    async linkEvaluationToIntake(evaluationId, intakeId) {
      state.links.push({ evaluationId, intakeId });
      return true;
    },
  };
}
