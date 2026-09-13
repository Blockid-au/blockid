// POST /api/investors/crm/import — CSV import (S28-B, editor+).
//
// Accepts the file three ways: multipart `file`, raw `text/csv`, or JSON
// `{ csv }`. Columns name,email,org,type,stage,tags (header aliases the
// usual CRM exports use are mapped — see lib/investors/crm
// `parseContactsCsv`). Max 500 data rows (the rest are ignored and
// reported as `truncated`), 1 MB body. Every cell is formula-guarded on
// the way in.
//
// Dedupe by email: a row whose address already exists on the project
// UPDATES that contact (name / org / type kept from the file when given,
// stage only moves FORWARD, tags are unioned); everything else is
// inserted. Rows with no name, a bad address or a duplicate address inside
// the file are skipped. Answers `{ created, updated, skipped, truncated }`.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { mergeImportRow, parseContactsCsv, type ContactRow } from "@/lib/investors/crm";
import { CONTACT_COLUMNS, resolveCrmScope } from "@/lib/investors/crm-server";

export const dynamic = "force-dynamic";

const IMPORT_MAX_BYTES = 1_000_000;

/** Pull the CSV text out of whichever body shape the client sent. */
async function readCsvBody(req: NextRequest): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > IMPORT_MAX_BYTES) return { ok: false, error: "File too large (1 MB max)", status: 413 };
  try {
    let text: string;
    if (ct.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return { ok: false, error: "Attach the CSV as the `file` field", status: 400 };
      if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: "File too large (1 MB max)", status: 413 };
      text = await file.text();
    } else if (ct.startsWith("application/json")) {
      const body = (await req.json().catch(() => null)) as { csv?: unknown } | null;
      if (!body || typeof body.csv !== "string") return { ok: false, error: "Send { csv: string }", status: 400 };
      text = body.csv;
    } else {
      text = await req.text();
    }
    if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: "File too large (1 MB max)", status: 413 };
    if (!text.trim()) return { ok: false, error: "The file is empty", status: 400 };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Could not read the upload", status: 400 };
  }
}

async function POST_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const body = await readCsvBody(req);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  const parsed = parseContactsCsv(body.text);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const { rows, skipped, truncated } = parsed.value;

  const access = await resolveCrmScope("editor");
  if (!access.ok) return access.response;
  const { projectId } = access;

  // Existing contacts by email (archived included — a re-import revives them).
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const byEmail = new Map<string, ContactRow>();
  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200);
    const { data } = await supabase.from("investor_contacts").select(CONTACT_COLUMNS).eq("project_id", projectId).in("email", chunk);
    for (const c of (data ?? []) as ContactRow[]) {
      if (c.project_id === projectId && c.email && chunk.includes(c.email)) byEmail.set(c.email, c);
    }
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const r of rows) {
    const existing = r.email ? byEmail.get(r.email) : undefined;
    if (existing) {
      const update = mergeImportRow(existing, r, now);
      if (Object.keys(update).length > 1) {
        const { error } = await supabase.from("investor_contacts").update(update).eq("id", existing.id).eq("project_id", projectId);
        if (error) {
          skipped.push({ line: r.line, reason: "update failed" });
          continue;
        }
      }
      updated++;
      continue;
    }
    inserts.push({
      project_id: projectId,
      name: r.name,
      email: r.email,
      org: r.org,
      role: null,
      type: r.type,
      stage: r.stage,
      source: "csv_import",
      tags: r.tags,
      owner_user_id: user.id,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
  }
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await supabase.from("investor_contacts").insert(chunk);
    if (error) {
      console.error("[investors:crm] import insert failed", error);
      return NextResponse.json(
        { ok: false, error: "Import failed part-way", created, updated, skipped: skipped.length, truncated },
        { status: 500 },
      );
    }
    created += chunk.length;
  }

  auditNote(null, { project_id: projectId, created, updated, skipped: skipped.length, truncated });
  return NextResponse.json({ ok: true, created, updated, skipped: skipped.length, skippedRows: skipped.slice(0, 50), truncated });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/investors/crm/import/route.ts", method: "POST" }, POST_handler);
