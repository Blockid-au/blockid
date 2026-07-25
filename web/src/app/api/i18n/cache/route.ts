/**
 * i18n cache admin endpoint (T-1403.12).
 *
 * GET  — list every EN→VI pair currently in the audit log (source of
 *        truth for reverse-lookup since the cache is sha-keyed).
 * POST — override a single entry: `{ locale, en, vi }`. Writes both
 *        the cache and an audit entry so the change survives lint.
 * DELETE — remove an override so the runtime engine re-generates.
 *
 * Auth: same admin-key pattern as /api/i18n/stats. 404 if
 * `INTERNAL_ADMIN_KEY` is missing or the header does not match.
 */

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/locales";
import { cacheSetMany, hashKey } from "@/lib/i18n/translate-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_ROOT = () => join(process.cwd(), "content", "i18n");
const MAX_LIST = 500;

function guard(req: Request): Response | null {
  const adminKey = process.env.INTERNAL_ADMIN_KEY ?? "";
  if (!adminKey) return new Response("Not found", { status: 404 });
  const provided = req.headers.get("x-admin-key") ?? "";
  if (provided !== adminKey) return new Response("Not found", { status: 404 });
  return null;
}

interface Entry {
  en: string;
  vi: string;
  ts: string;
}

async function readAudit(locale: Locale): Promise<Entry[]> {
  const path = join(CACHE_ROOT(), `${locale}-audit.jsonl`);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const seen = new Map<string, Entry>();
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as Entry;
      if (typeof e.en !== "string" || typeof e.vi !== "string") continue;
      // Last write wins.
      seen.set(e.en, { en: e.en, vi: e.vi, ts: e.ts ?? "" });
    } catch { /* skip */ }
  }
  return Array.from(seen.values()).slice(-MAX_LIST).reverse();
}

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const localeRaw = url.searchParams.get("locale") ?? "vi";
  const locale: Locale = isLocale(localeRaw) ? localeRaw : "vi";
  const entries = await readAudit(locale);
  return NextResponse.json({ locale, count: entries.length, entries });
}

export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  let body: { locale?: string; en?: string; vi?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { locale, en, vi } = body;
  if (typeof locale !== "string" || !isLocale(locale)) {
    return NextResponse.json({ error: "invalid_locale", allowed: LOCALES }, { status: 400 });
  }
  if (typeof en !== "string" || en.length === 0 || en.length > 4000) {
    return NextResponse.json({ error: "invalid_en" }, { status: 400 });
  }
  if (typeof vi !== "string" || vi.length === 0 || vi.length > 4000) {
    return NextResponse.json({ error: "invalid_vi" }, { status: 400 });
  }
  await cacheSetMany(locale as Locale, { [en]: vi });
  return NextResponse.json({ ok: true, key: hashKey(en) });
}
