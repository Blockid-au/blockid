// G22-D — the read side of /admin/validation: the auto-filled rows
// (pilot_orders + metrics, comp applications, feedback letters, cohorts
// scored) and the North Star / window line from lib/funnel/institutional.
//
// Every read is fail-soft: a missing table, a missing column or a
// misconfigured client becomes a warning on the page, never a 500 and never
// a fake 0. The client slice is the same mockable `InstitutionalClient` the
// funnel reader uses, so the colocated test runs on fakes.

import { readApplications } from "@/lib/pilots/applications";
import { readInstitutionalFunnel, type InstitutionalClient, type InstitutionalQuery, type InstitutionalResult } from "@/lib/funnel/institutional";
import { readValidationLedger } from "./ledger";
import { buildDashboard, deriveAutoRows, type AutoInputs, type AutoRow, type ValidationDashboard, type WindowMetric } from "./model";

export const AUTO_ROW_LIMIT = 500;

async function safe<T>(warnings: string[], label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function rowsOf<T>(warnings: string[], label: string, res: InstitutionalResult | null): T[] | null {
  if (!res) return null;
  if (res.error) {
    // 42P01 (table missing) / 42703 (column missing) read as "not available", the same as the funnel.
    warnings.push(`${label}: ${res.error.message ?? "query failed"}`);
    return null;
  }
  return (res.data ?? []) as T[];
}

type OrderRow = AutoInputs["pilotOrders"][number];
type LetterRow = AutoInputs["feedbackLetters"][number];
type BatchRow = AutoInputs["batches"][number];

const ORDER_COLS = "id, user_id, buyer_email, sku, amount_cents, currency, status, created_at, metrics";
/** G23-B (migration 0434): a converted pilot is an L5 row. */
const ORDER_COLS_V2 = `${ORDER_COLS}, converted_at, converted_plan`;
const BATCH_COLS = "id, user_id, name, status, total, done_count, finished_at, created_at";
const BATCH_COLS_V2 = `${BATCH_COLS}, program_name`;
/** G24-C (migration 0436): the demo flag — a demo cohort is a "workflow demo run" row, never "Cohort scored". */
const BATCH_COLS_V3 = `${BATCH_COLS_V2}, is_demo`;

/**
 * The operator account (mirrors lib/auth ADMIN_EMAIL without importing the
 * auth module into this read-only reader): a demo cohort loaded by an admin
 * seat is not buyer evidence.
 */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@blockid.au").toLowerCase();
export function isAdminOwner(owner: { email?: string | null; role?: string | null } | null | undefined): boolean {
  if (!owner) return false;
  if ((owner.role ?? "") === "admin") return true;
  return (owner.email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

/** Collect the inputs `deriveAutoRows` needs. Never throws. */
export async function readAutoInputs(client: InstitutionalClient | null, root: string): Promise<{ inputs: AutoInputs; warnings: string[] }> {
  const warnings: string[] = [];
  const inputs: AutoInputs = { pilotOrders: [], applications: [], feedbackLetters: [], batches: [] };

  const apps = await safe(warnings, "pilot-applications.jsonl", () => readApplications(root, AUTO_ROW_LIMIT));
  if (apps) inputs.applications = apps.map((a) => ({ id: a.id, program_name: a.program_name, cohort_size: a.cohort_size, intake_month: a.intake_month, received_at: a.received_at }));

  if (!client) {
    warnings.push("supabase not configured — pilot orders, feedback letters and cohorts unavailable");
    return { inputs, warnings };
  }

  const q = (table: string, cols: string) => client.from(table).select(cols);
  const run = (query: InstitutionalQuery) => query;

  // Pilot orders: the 0434 conversion columns first, then the 0416 shape (42703 = column missing, migration not applied yet).
  let ordersRes = await safe(warnings, "pilot_orders", async () => await run(q("pilot_orders", ORDER_COLS_V2).order("created_at", { ascending: true }).limit(AUTO_ROW_LIMIT)));
  if (ordersRes?.error && /converted_at|converted_plan|42703/i.test(ordersRes.error.message ?? "")) {
    ordersRes = await safe(warnings, "pilot_orders", async () => await run(q("pilot_orders", ORDER_COLS).order("created_at", { ascending: true }).limit(AUTO_ROW_LIMIT)));
  }
  const orders = rowsOf<OrderRow>(warnings, "pilot_orders", ordersRes);
  if (orders) inputs.pilotOrders = orders.map((o) => ({ ...o, metrics: o.metrics && typeof o.metrics === "object" ? o.metrics : null }));

  const letters = rowsOf<LetterRow>(warnings, "founder_feedback_letters", await safe(warnings, "founder_feedback_letters", async () => await run(q("founder_feedback_letters", "id, project_id, status, sent_at, org_count, k").in("status", ["sent", "opened"]).order("sent_at", { ascending: false }).limit(AUTO_ROW_LIMIT))));
  if (letters) inputs.feedbackLetters = letters;

  // Cohorts: the 0436 columns first, then the 0422 shape, then the 0322
  // shape (42703 = column missing; the message names the column, so a
  // pre-0422 server goes straight to the 0322 read).
  const readBatches = (cols: string) => safe(warnings, "evaluation_batches", async () => await run(q("evaluation_batches", cols).order("created_at", { ascending: false }).limit(AUTO_ROW_LIMIT)));
  let batchRes = await readBatches(BATCH_COLS_V3);
  const msg = () => batchRes?.error?.message ?? "";
  if (batchRes?.error && /program_name/i.test(msg())) {
    batchRes = await readBatches(BATCH_COLS);
  } else if (batchRes?.error && /is_demo|42703/i.test(msg())) {
    batchRes = await readBatches(BATCH_COLS_V2);
    if (batchRes?.error && /program_name|42703/i.test(msg())) batchRes = await readBatches(BATCH_COLS);
  }
  const batches = rowsOf<BatchRow & { user_id: string }>(warnings, "evaluation_batches", batchRes);
  if (batches && batches.length > 0) {
    const userIds = [...new Set(batches.map((b) => b.user_id).filter(Boolean))];
    const owners = rowsOf<{ id: string; email: string | null; role?: string | null }>([], "app_users", await safe([], "app_users", async () => await run(q("app_users", "id, email, role").in("id", userIds).limit(AUTO_ROW_LIMIT))));
    const ownerById = new Map((owners ?? []).map((o) => [o.id, o] as const));
    inputs.batches = batches.map((b) => {
      const owner = ownerById.get(b.user_id) ?? null;
      return { ...b, is_demo: b.is_demo === true, owner_email: owner?.email ?? null, owner_is_admin: isAdminOwner(owner) };
    });
  }

  return { inputs, warnings };
}

/** Everything /admin/validation renders. Never throws. */
export async function readValidationDashboard(client: InstitutionalClient | null, root: string, now: number = Date.now()): Promise<ValidationDashboard> {
  const [ledger, autoRead, funnel] = await Promise.all([
    readValidationLedger(root),
    readAutoInputs(client, root),
    readInstitutionalFunnel(client, now, root).catch((err: unknown) => ({ window: null, sections: [], northStar: null, warnings: [`institutional funnel: ${err instanceof Error ? err.message : String(err)}`] })),
  ]);
  const auto: AutoRow[] = deriveAutoRows(autoRead.inputs);
  const metrics: WindowMetric[] = funnel.sections.flatMap((s) => s.metrics.filter((m) => m.status === "live").map((m) => ({ key: `${s.key}.${m.key}`, label: `${s.label} · ${m.label}`, value: m.value, unit: m.unit })));
  return buildDashboard(ledger, auto, {
    north_star: funnel.northStar ? { month: funnel.northStar.month, assessed: funnel.northStar.assessed, assessed_all: funnel.northStar.assessed_all, paying_batches: funnel.northStar.paying_batches, paying_orgs: funnel.northStar.paying_orgs, partial: funnel.northStar.partial } : null,
    window: funnel.window ? { ...funnel.window, metrics } : null,
    warnings: [...autoRead.warnings, ...funnel.warnings],
  });
}
