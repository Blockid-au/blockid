// G16-C — the pilot ledger: `web/content/pilots.json` (committed, small,
// admin-edited only through the API) plus an append-only journal.
//
// Why a file and not a table: G16 § 2 forbids new tables with `app_users`
// FKs (erasure map), and the ledger holds ≤ PILOT_CAP active rows plus a
// short history. Erasure is a documented step in docs/ops/pilots.md.
//
// Where the file lives: on production `process.cwd()` is the release copy
// (`/data/releases/<BUILD_ID>`), which the next deploy replaces — so, like
// lib/status/jsonl.ts and lib/project-state.ts, every read and write goes
// to the LIVE checkout (`BLOCKID_WEB_DIR` → /home/dovanlong/blockid.au/web
// → cwd). Tests pass an explicit `root`.
//
// Durability: the live checkout is a git working tree that the
// self-upgrade loop may `git reset --hard` on a failed gate, which would
// restore a TRACKED file to HEAD and drop an uncommitted pilot. Every
// mutation is therefore also appended to `content/reports/pilots-journal.jsonl`
// (gitignored → untracked → untouched by a reset), and `readLedger()`
// replays journal rows that are newer than the file's copy. The ops
// runbook commits `content/pilots.json` after each start / end.
//
// Writes are atomic: temp file in the same directory + `rename`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_PILOT_DAYS, PILOT_CAP, PILOT_REMINDER_DAYS_BEFORE, PILOT_TIER } from "./offer";

export const LEDGER_FILE = path.join("content", "pilots.json");
export const JOURNAL_FILE = path.join("content", "reports", "pilots-journal.jsonl");
export const LEDGER_VERSION = 1 as const;

export type PilotStatus = "active" | "ended" | "expired";
/**
 * G21 P0-C: `comp` = the admin grant (G16-C, capped at PILOT_CAP);
 * `paid` = a Cohort Validation Pilot bought through Stripe (`pilot_orders`,
 * never capped, Cohort-tier plan). Absent on rows written before P0-C → comp.
 */
export type PilotSource = "comp" | "paid";
/** The plan tier a pilot row grants: the comped Program rung or a paid Cohort rung. */
export type PilotTier = typeof PILOT_TIER | "accelerator_starter" | "accelerator_growth";
export type PilotEndReason = "expired" | "ended_early" | "converted" | "withdrawn" | "other";

export interface PilotRow {
  id: string;
  user_id: string;
  email: string;
  program_name: string;
  tier: PilotTier;
  previous_plan: string | null;
  started_at: string;
  expires_at: string;
  credits_granted: number;
  intake_id: string | null;
  intake_slug: string | null;
  status: PilotStatus;
  ended_at: string | null;
  ended_reason: PilotEndReason | null;
  /** T-3 d reminder sent (once). */
  reminder_sent_at: string | null;
  /** Plan reverted on end / expiry (false when a Stripe subscription kept it). */
  plan_reverted: boolean | null;
  /** Bumped on every mutation; the journal replay keys on it. */
  updated_at: string;
  /** Admin e-mail that started the pilot. */
  started_by: string | null;
  /** Free-text note written at end (admin) or by the cron. */
  note: string | null;
  /** G21 P0-C — comp (admin grant) or paid (Stripe order). Missing = comp. */
  source?: PilotSource;
  /** G21 P0-C — `pilot_orders.id` for a paid pilot. */
  order_id?: string | null;
  /** G21 P0-C — applicants the paid pilot covers (25 / 50). */
  applicants_cap?: number | null;
}

export function pilotSource(row: Pick<PilotRow, "source">): PilotSource {
  return row.source === "paid" ? "paid" : "comp";
}

export interface PilotLedger {
  version: typeof LEDGER_VERSION;
  updated_at: string | null;
  pilots: PilotRow[];
}

export const EMPTY_LEDGER: PilotLedger = Object.freeze({ version: LEDGER_VERSION, updated_at: null, pilots: [] }) as PilotLedger;

const LIVE_WEB_DIR = "/home/dovanlong/blockid.au/web";

/** Directory that holds `content/` — the live checkout on production. */
export async function resolvePilotsRoot(): Promise<string> {
  if (process.env.BLOCKID_WEB_DIR) return process.env.BLOCKID_WEB_DIR;
  try {
    await fs.access(path.join(LIVE_WEB_DIR, "content"));
    return LIVE_WEB_DIR;
  } catch {
    return process.cwd();
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export function normalisePilotEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** `a***@domain` — never the full address on an admin screen or in a log. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function addDays(iso: string | Date, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Whole days until `expires_at` (ceil); negative once past. */
export function daysLeft(row: Pick<PilotRow, "expires_at">, now: Date = new Date()): number {
  return Math.ceil((Date.parse(row.expires_at) - now.getTime()) / 86_400_000);
}

export function activePilots(rows: readonly PilotRow[]): PilotRow[] {
  return rows.filter((r) => r.status === "active");
}

export function findActiveByEmail(rows: readonly PilotRow[], email: string): PilotRow | null {
  const e = normalisePilotEmail(email);
  return activePilots(rows).find((r) => r.email === e) ?? null;
}

/** The comp cap counts comped pilots only — a paid pilot never blocks a comp and is never blocked by one. */
export function capReached(rows: readonly PilotRow[], cap = PILOT_CAP): boolean {
  return activePilots(rows).filter((r) => pilotSource(r) === "comp").length >= cap;
}

export interface NewPilotInput {
  user_id: string;
  email: string;
  program_name: string;
  previous_plan: string | null;
  credits_granted: number;
  intake_id: string | null;
  intake_slug: string | null;
  days?: number;
  started_by?: string | null;
  /** G21 P0-C — defaults to the comped Program tier. */
  tier?: PilotTier;
  source?: PilotSource;
  order_id?: string | null;
  applicants_cap?: number | null;
}

export function newPilotRow(input: NewPilotInput, now: Date = new Date(), id: string = randomUUID()): PilotRow {
  const started = now.toISOString();
  const days = input.days ?? DEFAULT_PILOT_DAYS;
  return {
    id,
    user_id: input.user_id,
    email: normalisePilotEmail(input.email),
    program_name: input.program_name.trim(),
    tier: input.tier ?? PILOT_TIER,
    previous_plan: input.previous_plan,
    started_at: started,
    expires_at: addDays(started, days),
    credits_granted: input.credits_granted,
    intake_id: input.intake_id,
    intake_slug: input.intake_slug,
    status: "active",
    ended_at: null,
    ended_reason: null,
    reminder_sent_at: null,
    plan_reverted: null,
    updated_at: started,
    started_by: input.started_by ?? null,
    note: null,
    ...(input.source ? { source: input.source } : {}),
    ...(input.order_id ? { order_id: input.order_id } : {}),
    ...(input.applicants_cap ? { applicants_cap: input.applicants_cap } : {}),
  };
}

export interface ExpiryPlan {
  /** Active, within PILOT_REMINDER_DAYS_BEFORE of expiry, reminder not yet sent. */
  remind: PilotRow[];
  /** Active and `expires_at` ≤ now. */
  expire: PilotRow[];
}

/** What the daily cron would do at `now` — pure, so `?dry=1` and the test share it. */
export function planExpiry(rows: readonly PilotRow[], now: Date = new Date(), remindDays = PILOT_REMINDER_DAYS_BEFORE): ExpiryPlan {
  const remind: PilotRow[] = [];
  const expire: PilotRow[] = [];
  for (const r of activePilots(rows)) {
    const left = daysLeft(r, now);
    if (left <= 0) expire.push(r);
    else if (left <= remindDays && !r.reminder_sent_at) remind.push(r);
  }
  return { remind, expire };
}

// ── File IO ─────────────────────────────────────────────────────────────────

function isRow(v: unknown): v is PilotRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.email === "string" && typeof r.status === "string" && typeof r.expires_at === "string";
}

function parseLedger(raw: string): PilotLedger {
  const parsed = JSON.parse(raw) as Partial<PilotLedger>;
  const pilots = Array.isArray(parsed.pilots) ? parsed.pilots.filter(isRow) : [];
  return { version: LEDGER_VERSION, updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : null, pilots };
}

interface JournalLine {
  ts: string;
  op: string;
  pilot: PilotRow;
}

async function readJournal(root: string): Promise<JournalLine[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, JOURNAL_FILE), "utf8");
  } catch {
    return [];
  }
  const out: JournalLine[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as JournalLine;
      if (j && isRow(j.pilot)) out.push(j);
    } catch {
      // half-written tail line — skip
    }
  }
  return out;
}

/**
 * Merge the journal over the file: a journal row wins when the file has no
 * row with that id or its copy is older (`updated_at`). Pure.
 */
export function mergeJournal(ledger: PilotLedger, journal: readonly { pilot: PilotRow }[]): { ledger: PilotLedger; recovered: number } {
  const byId = new Map(ledger.pilots.map((p) => [p.id, p]));
  let recovered = 0;
  for (const { pilot } of journal) {
    const have = byId.get(pilot.id);
    if (!have || Date.parse(pilot.updated_at) > Date.parse(have.updated_at)) {
      byId.set(pilot.id, pilot);
      recovered += 1;
    }
  }
  if (!recovered) return { ledger, recovered: 0 };
  const pilots = [...byId.values()].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  return { ledger: { ...ledger, pilots }, recovered };
}

/** Read the ledger (+ journal replay). A missing or corrupt file yields the empty ledger. */
export async function readLedger(root: string): Promise<PilotLedger> {
  let ledger: PilotLedger;
  try {
    ledger = parseLedger(await fs.readFile(path.join(root, LEDGER_FILE), "utf8"));
  } catch {
    ledger = { ...EMPTY_LEDGER, pilots: [] };
  }
  const journal = await readJournal(root);
  const merged = mergeJournal(ledger, journal);
  if (merged.recovered > 0) {
    console.warn(`[blockid:pilots] ledger recovered ${merged.recovered} row(s) from the journal — commit content/pilots.json`);
  }
  return merged.ledger;
}

/** Atomic write: temp file beside the target, then rename. */
export async function writeLedger(root: string, ledger: PilotLedger): Promise<void> {
  const target = path.join(root, LEDGER_FILE);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify({ version: LEDGER_VERSION, updated_at: new Date().toISOString(), pilots: ledger.pilots }, null, 2) + "\n";
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, target);
}

async function appendJournal(root: string, op: string, pilot: PilotRow): Promise<void> {
  const file = path.join(root, JOURNAL_FILE);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify({ ts: new Date().toISOString(), op, pilot }) + "\n", "utf8");
  } catch (err) {
    console.error("[blockid:pilots] journal append failed", err instanceof Error ? err.message : String(err));
  }
}

/** Insert or replace one row (by id), bump `updated_at`, journal it, write atomically. */
export async function upsertPilot(root: string, row: PilotRow, op: string, now: Date = new Date()): Promise<PilotRow> {
  const ledger = await readLedger(root);
  const next: PilotRow = { ...row, updated_at: now.toISOString() };
  const idx = ledger.pilots.findIndex((p) => p.id === next.id);
  const pilots = idx === -1 ? [...ledger.pilots, next] : ledger.pilots.map((p, i) => (i === idx ? next : p));
  await writeLedger(root, { ...ledger, pilots });
  await appendJournal(root, op, next);
  return next;
}
