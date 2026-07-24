/**
 * GET /api/templates/legal/[slug]
 *
 * Public — no auth. Returns the rendered legal template as `text/markdown`.
 * If `?values=<JSON>` is present, the JSON object is used to substitute
 * `{{placeholder}}` tokens (see renderTemplate in legal-templates.ts).
 *
 * Emits an analytics event per request so we can measure adoption without
 * breaking anonymous access.
 */

import { NextResponse } from "next/server";
import {
  getTemplate,
  readTemplateRaw,
  applySubstitutions,
} from "@/lib/templates/legal-templates";
import { emitEvent } from "@/lib/analytics/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const tpl = getTemplate(slug);
  if (!tpl) {
    return NextResponse.json(
      { ok: false, error: "Template not found" },
      { status: 404 },
    );
  }

  const raw = await readTemplateRaw(slug);
  if (raw == null) {
    return NextResponse.json(
      { ok: false, error: "Template file could not be read" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const rawValues = url.searchParams.get("values");
  const download = url.searchParams.get("download") === "1";

  let body = raw;
  let usedPlaceholders = false;
  if (rawValues) {
    try {
      const parsed = JSON.parse(rawValues) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string") values[k] = v;
          else if (typeof v === "number" || typeof v === "boolean")
            values[k] = String(v);
        }
        body = applySubstitutions(raw, values);
        usedPlaceholders = true;
      }
    } catch {
      // Malformed JSON — fall back to raw body rather than 400 so a
      // sloppy query string still returns a usable document.
    }
  }

  // Fire-and-forget analytics — never let this fail the request.
  void emitEvent({
    name: "legal_template_fetched",
    params: {
      slug,
      category: tpl.category,
      substituted: usedPlaceholders,
      download,
    },
    source: "server",
  }).catch(() => undefined);

  const filename = `${tpl.slug}.md`;
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(body, { status: 200, headers });
}
