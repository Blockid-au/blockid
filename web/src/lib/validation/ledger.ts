// G22-D — the validation tracker ledger file:
// `web/content/reports/validation-tracker.json` (committed with the other
// reports; founder-edited only through /api/admin/validation).
//
// Same shape and rules as lib/pilots/ledger.ts: reads and writes go to the
// LIVE checkout (`BLOCKID_WEB_DIR` → /home/dovanlong/blockid.au/web → cwd),
// tests pass an explicit `root`; writes are atomic (temp file + rename). It
// lives under content/reports/ so deploy-live.sh's DEPLOY_DIRTY_IGNORE
// leaves an uncommitted edit alone, and the ops runbook
// (docs/ops/validation-tracker.md) commits it with the reports.
//
// No journal: the file is small, edits are rare (a founder typing after a
// call) and a lost row is re-typed from the founder's notes — unlike a pilot
// entitlement, nothing downstream depends on it.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePilotsRoot } from "@/lib/pilots/ledger";
import {
  EMPTY_VALIDATION_LEDGER,
  LEDGER_MAX_ENTRIES,
  LEDGER_VERSION,
  applyPatch,
  newEntry,
  parseLedger,
  removeEntry,
  upsertEntry,
  type ValidationEntry,
  type ValidationEntryInput,
  type ValidationEntryPatch,
  type ValidationLedger,
} from "./model";

export const VALIDATION_LEDGER_FILE = path.join("content", "reports", "validation-tracker.json");

/** Directory that holds `content/` — the live checkout on production. */
export const resolveValidationRoot = resolvePilotsRoot;

/** Read the ledger; a missing or corrupt file yields the empty ledger. */
export async function readValidationLedger(root: string): Promise<ValidationLedger> {
  try {
    return parseLedger(await fs.readFile(path.join(root, VALIDATION_LEDGER_FILE), "utf8"));
  } catch {
    return { ...EMPTY_VALIDATION_LEDGER, entries: [] };
  }
}

/** Atomic write: temp file beside the target, then rename. */
export async function writeValidationLedger(root: string, ledger: ValidationLedger, now: Date = new Date()): Promise<void> {
  const target = path.join(root, VALIDATION_LEDGER_FILE);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify({ version: LEDGER_VERSION, updated_at: now.toISOString(), entries: ledger.entries }, null, 2) + "\n";
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, target);
}

export type LedgerMutation<T> = { ok: true; value: T; ledger: ValidationLedger } | { ok: false; error: "not_found" | "ledger_full"; message: string };

export async function createEntry(root: string, input: ValidationEntryInput, now: Date = new Date(), id: string = randomUUID()): Promise<LedgerMutation<ValidationEntry>> {
  const ledger = await readValidationLedger(root);
  if (ledger.entries.length >= LEDGER_MAX_ENTRIES) return { ok: false, error: "ledger_full", message: `The tracker holds at most ${LEDGER_MAX_ENTRIES} entries — archive old rows first.` };
  const entry = newEntry(input, id, now);
  const next = upsertEntry(ledger, entry);
  await writeValidationLedger(root, next, now);
  return { ok: true, value: entry, ledger: next };
}

export async function patchEntry(root: string, id: string, patch: ValidationEntryPatch, now: Date = new Date()): Promise<LedgerMutation<ValidationEntry>> {
  const ledger = await readValidationLedger(root);
  const have = ledger.entries.find((e) => e.id === id);
  if (!have) return { ok: false, error: "not_found", message: "No entry with that id." };
  const entry = applyPatch(have, patch, now);
  const next = upsertEntry(ledger, entry);
  await writeValidationLedger(root, next, now);
  return { ok: true, value: entry, ledger: next };
}

export async function deleteEntry(root: string, id: string, now: Date = new Date()): Promise<LedgerMutation<ValidationEntry>> {
  const ledger = await readValidationLedger(root);
  const { ledger: next, removed } = removeEntry(ledger, id);
  if (!removed) return { ok: false, error: "not_found", message: "No entry with that id." };
  await writeValidationLedger(root, next, now);
  return { ok: true, value: removed, ledger: next };
}
