// /api/corrections — founder correction workflow (G21 P1-C, score-governance § 10).
//
//   POST { projectId, kind, targetRef?, message, proposed? }
//        → 201 { ok, correction }   the project OWNER files a correction
//          (members cannot — the record is the founder's). Rate-limited
//          per user; admin e-mailed; audit action `correction.filed`.
//        401 anon · 403 member / not owner · 404 unknown project ·
//        400 invalid body · 429 rate limit or too many open · 503 no db
//   GET  ?project=<uuid> → 200 { ok, corrections }  the owner's list.
//
// Nothing here changes a score or a record: a correction is a logged
// request; an admin resolves it on /admin/corrections.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertProjectAccess, ProjectAccessError } from "@/lib/projects";
import { checkRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { parseCorrectionInput } from "@/lib/corrections/model";
import { fileCorrection, listProjectCorrections } from "@/lib/corrections/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BODY_MAX_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Filings per user per hour. */
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function accessError(err: unknown): NextResponse | null {
  if (!(err instanceof ProjectAccessError)) return null;
  if (err.code === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (err.code === "forbidden") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`corrections:file:${user.id}`, RATE_MAX, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited", message: "Too many corrections in the last hour — try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } });
  }

  const parsedBody = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = parseCorrectionInput(parsedBody.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "invalid_input", field: parsed.field, message: parsed.error }, { status: 400 });

  let access;
  try {
    access = await assertProjectAccess(user.id, parsed.input.projectId, "viewer");
  } catch (err) {
    const res = accessError(err);
    if (res) return res;
    throw err;
  }
  if (!access.isOwner) return NextResponse.json({ ok: false, error: "forbidden", message: "Only the startup's owner can file a correction." }, { status: 403 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const r = await fileCorrection(db, { ...parsed.input, submittedBy: user.id, submitterEmail: user.email, projectName: access.project.name ?? null });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, message: r.message }, { status: r.status });

  auditAction("correction.filed");
  auditNote(r.row.id, { project_id: r.row.project_id, kind: r.row.kind, target_ref: r.row.target_ref });
  return NextResponse.json({ ok: true, correction: r.row, warnings: r.warnings }, { status: 201 });
}

async function GET_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  if (!UUID_RE.test(projectId)) return NextResponse.json({ ok: false, error: "invalid_input", message: "project must be a uuid" }, { status: 400 });

  try {
    const access = await assertProjectAccess(user.id, projectId, "viewer");
    if (!access.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  } catch (err) {
    const res = accessError(err);
    if (res) return res;
    throw err;
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const corrections = await listProjectCorrections(db, projectId);
  return NextResponse.json({ ok: true, corrections });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const POST = apiRoute({ route: "api/corrections/route.ts", method: "POST" }, POST_handler);
export const GET = GET_handler;
