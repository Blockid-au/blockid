/**
 * /admin/i18n/review — human QA surface for the runtime MT cache
 * (T-1403.12).
 *
 * Lists the most recent EN→VI cache entries from the audit log so an
 * admin can spot-check pragmatic register, catch reserved-term drift
 * that slipped past the automated check, and override the model's
 * translation with a human-authored one.
 *
 * Auth: standard admin gate (email match or role=admin). Non-admins
 * are 307'd to /dashboard/svi per the site-wide pattern.
 *
 * Data path: `readAudit()` reads `content/i18n/vi-audit.jsonl` directly
 * — no DB hop. The audit is written by `cacheSetMany` in
 * translate-cache.ts every time a fresh entry lands.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { I18nReviewClient } from "./i18n-review-client";

export const metadata: Metadata = {
  title: "i18n cache review — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Entry {
  en: string;
  vi: string;
  ts: string;
}

async function readAudit(): Promise<Entry[]> {
  const path = join(process.cwd(), "content", "i18n", "vi-audit.jsonl");
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const seen = new Map<string, Entry>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as Entry;
      if (typeof e.en === "string" && typeof e.vi === "string") {
        seen.set(e.en, { en: e.en, vi: e.vi, ts: e.ts ?? "" });
      }
    } catch { /* skip malformed */ }
  }
  return Array.from(seen.values()).slice(-500).reverse();
}

export default async function I18nReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/i18n/review");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/dashboard/svi");

  const entries = await readAudit();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6" data-i18n-skip>
        <div className="text-xs uppercase tracking-wider text-brand-ink-muted">Admin · i18n</div>
        <h1 className="text-2xl font-semibold text-brand-ink">
          Translation cache review — VI
        </h1>
        <p className="mt-2 text-sm text-brand-ink-muted">
          {entries.length} recent EN→VI entries (last-write-wins per EN
          string). Override the translation to update
          <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-xs">
            web/content/i18n/vi-cache.json
          </code>
          and append an audit line.
        </p>
      </header>
      <I18nReviewClient entries={entries} />
    </main>
  );
}
