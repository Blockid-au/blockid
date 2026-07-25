/**
 * POST /api/i18n/translate — batch translation endpoint (T-1403).
 *
 * Consumed by the client-side <TranslationProvider> DOM walker, which
 * batches every user-visible text node on the page into a single call.
 *
 * Body: { locale: "vi", strings: string[] }
 * Response: { translations: Record<string, string> }
 *
 * The endpoint is intentionally simple — validation only, no rate
 * limiting here (the outer middleware rate-limits per-IP). It resolves
 * from the disk cache first and only calls Gemini for strings that
 * miss, so the cost model degrades to ~0 after the first visit to any
 * page in VI mode.
 */

import { NextResponse } from "next/server";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/locales";
import { translateBatch } from "@/lib/i18n/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STRINGS = 200;
const MAX_STRING_LEN = 4000;

type Body = {
  locale?: string;
  strings?: unknown;
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const locale = body.locale;
  if (typeof locale !== "string" || !isLocale(locale)) {
    return json({ error: "invalid_locale", allowed: LOCALES }, 400);
  }

  const raw = body.strings;
  if (!Array.isArray(raw)) {
    return json({ error: "strings_required" }, 400);
  }

  const strings: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") continue;
    if (s.length === 0 || s.length > MAX_STRING_LEN) continue;
    strings.push(s);
    if (strings.length >= MAX_STRINGS) break;
  }

  if (strings.length === 0) {
    return json({ translations: {} });
  }

  try {
    const translations = await translateBatch(strings, locale as Locale);
    return json({ translations });
  } catch {
    return json({ error: "translate_failed" }, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "application/json",
    },
  });
}
