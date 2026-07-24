// POST /api/admin/ga4-refresh — admin-gated on-demand GA4 pull.
//
// Verifies the caller is admin, calls fetchDailySnapshot(), appends the
// resulting snapshot line to web/content/reports/ga4-daily.jsonl, and
// returns a minimal { ok, date, sessions } payload. In-memory throttle
// caps this to one call per 60s per process — cheap defence against
// double-clicks blowing the GA4 daily quota.
//
// See docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.

import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { fetchDailySnapshot } from "@/lib/ga4/data-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSONL_PATH = path.join(process.cwd(), "content", "reports", "ga4-daily.jsonl");
const THROTTLE_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (typeof g.__ga4RefreshLastAt !== "number") g.__ga4RefreshLastAt = 0;

export async function POST() {
  const user = await getCurrentUser();
  const isAdmin = !!user && (user.email === ADMIN_EMAIL || user.role === "admin");
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const since = now - (g.__ga4RefreshLastAt as number);
  if (since < THROTTLE_MS) {
    return NextResponse.json(
      { ok: false, error: `rate-limited: retry in ${Math.ceil((THROTTLE_MS - since) / 1000)}s` },
      { status: 429 },
    );
  }
  g.__ga4RefreshLastAt = now;

  const result = await fetchDailySnapshot();
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, hint: result.hint }, { status: 500 });
  }

  try {
    await fs.mkdir(path.dirname(JSONL_PATH), { recursive: true });
    // Idempotence: skip if a line for this date already exists.
    let existing = "";
    try {
      existing = await fs.readFile(JSONL_PATH, "utf8");
    } catch {
      /* new file */
    }
    const already = existing
      .split("\n")
      .filter(Boolean)
      .some((line) => {
        try {
          const parsed = JSON.parse(line) as { date?: string };
          return parsed.date === result.snapshot.date;
        } catch {
          return false;
        }
      });

    if (!already) {
      await fs.appendFile(JSONL_PATH, JSON.stringify(result.snapshot) + "\n", "utf8");
    }

    return NextResponse.json({
      ok: true,
      date: result.snapshot.date,
      sessions: result.snapshot.totals.sessions,
      appended: !already,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `write failed: ${msg}` }, { status: 500 });
  }
}
