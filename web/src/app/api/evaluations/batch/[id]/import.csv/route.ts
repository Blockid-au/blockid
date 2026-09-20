// POST /api/evaluations/batch/[id]/import.csv — CSV import into a BlockID
// Cohort (G21 P2-A; docs/plans/g21-fi-upgrade-2026-09-20.md § P2-A).
//
//   body: multipart/form-data with a `file` part, or a raw text/csv body
//   columns: company, url, contact_email, stage, sector, deck_url (+ abn) —
//           header row required, case-insensitive (lib/evaluations/cohort-import.ts)
//   → 200 { ok, imported, skipped: [{line, reason, message}], cap: {used, max, remaining}, batch, invites_sent }
//   401 anonymous · 403 feature_locked (same gate as batch creation:
//   lp_export OR accelerator.cohort) · 404 not my batch · 400 invalid_csv
//   (no header / empty / unreadable) · 413 over 2 MB · 409 cap_reached
//   (applicants_cap from the paid pilot: used + valid rows > cap; nothing is
//   created) · 429 rate limit (10 imports / hour) · 503 DB.
//
// Per valid row, in order: createEvaluation() — the SAME helper POST
// /api/evaluations uses (evaluator-owned project + evaluations row +
// founder invite e-mail carrying the cohort template's consent text) —
// then the batch item (addEvaluationsToBatch re-queues a closed cohort so
// the off-peak runner scores the new rows). A row whose create fails is
// reported under `skipped` with reason `create_failed` / `plan_limit`; the
// rest still import. Dedupe: inside the file and against the evaluations
// already in the cohort (normalised domain / ABN / e-mail). Emits
// `startup_added_to_cohort` per row created (FI envelope, channel
// csv_import). Quota for the scoring itself is re-checked per item by the
// runner (review #8), so the import never charges anything.

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, isUuid } from "@/lib/security/request-guards";
import { parseMultipart } from "@/lib/http/multipart";
import { gateBatchRequest } from "@/lib/evaluations/batch-gate";
import { addEvaluationsToBatch, countBatchItems, getBatchForUser, loadBatchDedupeSources } from "@/lib/evaluations/batch";
import { IMPORT_MAX_BYTES, capState, keysForExisting, parseCohortImport, type ImportSkip } from "@/lib/evaluations/cohort-import";
import { createEvaluation } from "@/lib/evaluations";
import { getTemplateById } from "@/lib/intake/templates";
import { emitFiEvent } from "@/lib/analytics/fi-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export const IMPORT_RATE_MAX = 10;
export const IMPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
const BODY_HARD_CAP = IMPORT_MAX_BYTES + 64 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/** The CSV text from a multipart `file` part or a raw text body; null when unreadable. */
export async function readCsvBody(request: Request): Promise<{ ok: true; text: string } | { ok: false; error: "too_large" | "unreadable" }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_HARD_CAP) return { ok: false, error: "too_large" };
  let raw: Buffer;
  try {
    raw = Buffer.from(await request.arrayBuffer());
  } catch {
    return { ok: false, error: "unreadable" };
  }
  if (raw.byteLength > BODY_HARD_CAP) return { ok: false, error: "too_large" };
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const parsed = parseMultipart(raw, contentType);
      const file = parsed.files.find((f) => f.name === "file") ?? parsed.files[0];
      const text = file ? file.buffer.toString("utf8") : (parsed.fields.csv ?? parsed.fields.text ?? "");
      if (Buffer.byteLength(text, "utf8") > IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };
      return { ok: true, text };
    } catch {
      return { ok: false, error: "unreadable" };
    }
  }
  if (raw.byteLength > IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true, text: raw.toString("utf8") };
}

async function POST_handler(request: Request, { params }: Ctx) {
  const { user, response } = await gateBatchRequest("api/evaluations/batch/[id]/import.csv");
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const limited = enforceRateLimit("cohort-import", user.id, request, IMPORT_RATE_MAX, IMPORT_RATE_WINDOW_MS);
  if (limited) return limited;

  const batch = await getBatchForUser(user.id, id);
  if (!batch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const body = await readCsvBody(request);
  if (!body.ok) {
    if (body.error === "too_large") {
      return NextResponse.json({ ok: false, error: "too_large", message: `The file must be under ${IMPORT_MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
    }
    return NextResponse.json({ ok: false, error: "invalid_csv", message: "Could not read the upload" }, { status: 400 });
  }

  const existing = keysForExisting(await loadBatchDedupeSources(batch.id));
  const parsed = parseCohortImport(body.text, { existingKeys: existing });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error === "too_large" ? "too_large" : "invalid_csv", message: parsed.message }, { status: parsed.error === "too_large" ? 413 : 400 });
  }

  // applicants_cap (paid pilot) — all-or-nothing, like the batch quota.
  const used = await countBatchItems(batch.id);
  const cap = capState(used, batch.applicantsCap);
  if (cap.max != null && used + parsed.rows.length > cap.max) {
    return NextResponse.json(
      {
        ok: false,
        error: "cap_reached",
        message: `This cohort is capped at ${cap.max} startups by your pilot; ${used} are in it and this file adds ${parsed.rows.length}. Remove ${used + parsed.rows.length - cap.max} row${used + parsed.rows.length - cap.max === 1 ? "" : "s"} or upgrade the pilot.`,
        cap,
        needed: parsed.rows.length,
        skipped: parsed.skipped,
      },
      { status: 409 },
    );
  }

  const template = await getTemplateById(batch.templateId);
  const consentText = template?.consentText ?? null;

  const created: string[] = [];
  const skipped: ImportSkip[] = [...parsed.skipped];
  let invitesSent = 0;
  let planLimitHit = false;
  for (const row of parsed.rows) {
    if (planLimitHit) {
      skipped.push({ line: row.line, reason: "plan_limit", message: "Plan limit reached — upgrade to track more startups" });
      continue;
    }
    const result = await createEvaluation(
      user,
      {
        name: row.company,
        website: row.url,
        founder_email: row.contactEmail,
        industry: row.sector,
        stage: row.stage,
        notes: row.deckUrl ? `Deck: ${row.deckUrl}` : null,
        abn: row.abn,
      },
      { consentText },
    );
    if (!result.ok) {
      if (result.error === "evaluation_limit_reached") {
        planLimitHit = true;
        skipped.push({ line: row.line, reason: "plan_limit", message: result.message });
      } else {
        skipped.push({ line: row.line, reason: "create_failed", message: result.message });
      }
      continue;
    }
    created.push(result.evaluation.id);
    if (result.inviteSent) invitesSent += 1;
    emitFiEvent("startup_added_to_cohort", {
      organisation: user.id,
      startup: result.evaluation.projectId,
      plan: user.plan ?? null,
      channel: "csv_import",
      userId: user.id,
      email: user.email,
      batch_id: batch.id,
      evaluation_id: result.evaluation.id,
      invite_sent: result.inviteSent,
    });
  }

  const added = await addEvaluationsToBatch(batch, created);
  if (!added.ok) {
    return NextResponse.json({ ok: false, error: added.error, message: added.message, created: created.length, skipped }, { status: added.error === "service_unavailable" ? 503 : 500 });
  }
  skipped.sort((a, b) => a.line - b.line);
  return NextResponse.json(
    {
      ok: true,
      imported: added.added.length,
      skipped,
      cap: capState(used + added.added.length, batch.applicantsCap),
      invites_sent: invitesSent,
      batch: added.batch,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/evaluations/batch/[id]/import.csv/route.ts", method: "POST" }, POST_handler);
