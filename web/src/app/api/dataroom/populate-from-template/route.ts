// POST /api/dataroom/populate-from-template
//
// Seeds the caller's data room with placeholder rows derived from a
// reference successful case (Atlassian in v1). Contract at
// docs/plans/atlassian-standard-mapping-goal.md §2.
//
// Modes:
//   - dry_run  : returns the diff, writes nothing
//   - append   : inserts missing template rows, leaves everything else alone
//   - replace  : archives existing template rows first, then appends
//
// User uploads (mime_type !== TEMPLATE_MIME_MARKER) are NEVER touched
// regardless of mode.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  populateFromTemplate,
  type PopulateMode,
} from "@/lib/dataroom/populate";
import { ATLASSIAN_DATAROOM_TEMPLATE } from "@/lib/dataroom/atlassian-template";

export const dynamic = "force-dynamic";

const IMPLEMENTED_TEMPLATES = ["atlassian"] as const;
const ALL_TEMPLATES = [
  "atlassian",
  "canva",
  "xero",
  "safetyculture",
  "saas_generic",
] as const;

const BodySchema = z.object({
  template: z.enum(ALL_TEMPLATES),
  mode: z.enum(["append", "replace", "dry_run"]),
  project_id: z.string().uuid().optional(),
});

// Simple per-user rate limit — 5 populates per hour. Uses a module-scope
// Map so it survives across requests inside a single Node process (good
// enough for MVP; a persistent rate-limit table can be layered later).
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    hits.set(userId, arr);
    return false;
  }
  arr.push(now);
  hits.set(userId, arr);
  return true;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        detail: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { template, mode, project_id: projectIdInput } = parsed.data;

  if (!IMPLEMENTED_TEMPLATES.includes(template as "atlassian")) {
    return NextResponse.json(
      {
        ok: false,
        error: "template_not_implemented",
        hint: "atlassian only in v1",
      },
      { status: 400 },
    );
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        detail: `max ${RATE_LIMIT} populates per hour`,
      },
      { status: 429 },
    );
  }

  // Default project = user's first (default) project. Non-blocking:
  // dataroom_files does not currently carry project_id so this just
  // stamps the audit trail.
  let projectId: string | null = projectIdInput ?? null;
  if (!projectId) {
    const active = await getActiveProject(user.id);
    projectId = active?.id ?? null;
  }

  const result = await populateFromTemplate({
    userId: user.id,
    email: user.email,
    projectId,
    template: ATLASSIAN_DATAROOM_TEMPLATE,
    mode: mode as PopulateMode,
  });

  // Best-effort audit — analytics_events (CDO GA4 mirror); table may not
  // exist in every environment, so we silence errors.
  try {
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_name: "dataroom.populate_from_template",
      params: {
        template,
        mode,
        project_id: projectId,
        ok: result.ok,
        created: result.ok ? result.created : 0,
        updated: result.ok ? result.updated : 0,
        skipped: result.ok ? result.skipped : 0,
      },
    });
  } catch {
    // non-fatal
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
