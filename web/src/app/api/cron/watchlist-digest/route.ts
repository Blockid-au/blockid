// /api/cron/watchlist-digest (T_SVI_EXC_0004) — daily email summarising SVI
// movement on tickers the user has watchlisted.
//
// Cron: 0 9 * * * UTC (19:00 AEST). Compares the latest analysis's SVI for
// each watched ticker against the snapshot stored on the last digest. Emails
// the user when any ticker moved ≥5 SVI points or shifted stage.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { computeListings } from "@/lib/startup-index-listings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;
const SVI_THRESHOLD = 5;

interface WatchlistRow {
  id: string;
  account_id: string;
  ticker: string;
  last_digest_svi: number | null;
  last_digest_stage: number | null;
  last_digest_at: string | null;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
}

interface Movement {
  ticker: string;
  slug: string;
  prevSvi: number | null;
  newSvi: number;
  prevStage: number | null;
  newStage: number;
  stageLabel: string;
}

function renderHtml(name: string, moves: Movement[]): string {
  const rows = moves.map((m) => {
    const delta = m.prevSvi !== null ? m.newSvi - m.prevSvi : null;
    const arrow = delta === null ? "new" : delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
    const color = delta === null ? "#0369a1" : delta > 0 ? "#047857" : delta < 0 ? "#be123c" : "#475569";
    return `
      <tr>
        <td style="padding:8px 12px;font-family:monospace;font-weight:600">${m.ticker}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${color}">${m.newSvi}</td>
        <td style="padding:8px 12px;text-align:right;color:${color}">${arrow}${delta !== null ? ` ${Math.abs(delta).toFixed(1)}` : ""}</td>
        <td style="padding:8px 12px;font-size:12px;color:#475569">S${m.newStage} · ${m.stageLabel}</td>
        <td style="padding:8px 12px;text-align:right">
          <a href="https://startupvalueindex.com/listings/${m.ticker}" style="color:#0f766e;font-weight:600">Open</a>
        </td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="padding:24px;border-bottom:1px solid #e2e8f0">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.16em">Watchlist · Daily digest</p>
      <h1 style="margin:8px 0 0;font-size:22px">Hi ${name},</h1>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">${moves.length} ticker${moves.length === 1 ? "" : "s"} on your watchlist moved overnight on the Startup Value Index™.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <div style="padding:20px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b">
      <a href="https://blockid.au/dashboard/watchlist" style="color:#0f766e">Manage your watchlist</a> · powered by BlockID Startup Value Index™
    </div>
  </div>
</body></html>`;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 500 });

  const { data: watchRows } = await supabase
    .from("watchlist")
    .select("id, account_id, ticker, last_digest_svi, last_digest_stage, last_digest_at");
  const watch = (watchRows ?? []) as WatchlistRow[];
  if (watch.length === 0) return NextResponse.json({ ok: true, users: 0, sent: 0 });

  // Load every listing once (paged at the max page size). The cron only
  // cares about the latest SVI/stage per ticker, so one snapshot suffices.
  const indexed = await computeListings({
    filter: { sector: "all", stage: "all", publicOnly: false, revenueOnly: false },
    sort: "svi",
    order: "desc",
    page: 1,
    pageSize: 1000,
  });
  const latestByTicker = new Map<string, { svi: number; stage: number; stageLabel: string; slug: string }>();
  for (const r of indexed.rows) {
    latestByTicker.set(r.ticker, { svi: r.svi, stage: r.stage, stageLabel: r.stageLabel, slug: r.slug });
  }

  const userIds = Array.from(new Set(watch.map((w) => w.account_id)));
  const { data: userRows } = await supabase
    .from("app_users")
    .select("id, email, display_name")
    .in("id", userIds);
  const usersById = new Map<string, UserRow>();
  for (const u of (userRows ?? []) as UserRow[]) usersById.set(u.id, u);

  const byUser = new Map<string, { moves: Movement[]; rowIds: string[] }>();
  for (const w of watch) {
    const latest = latestByTicker.get(w.ticker);
    if (!latest) continue;
    const sviChanged = w.last_digest_svi === null || Math.abs(latest.svi - w.last_digest_svi) >= SVI_THRESHOLD;
    const stageChanged = w.last_digest_stage !== latest.stage;
    if (!sviChanged && !stageChanged) continue;

    const move: Movement = {
      ticker: w.ticker,
      slug: latest.slug,
      prevSvi: w.last_digest_svi,
      newSvi: latest.svi,
      prevStage: w.last_digest_stage,
      newStage: latest.stage,
      stageLabel: latest.stageLabel,
    };
    const entry = byUser.get(w.account_id) ?? { moves: [], rowIds: [] };
    entry.moves.push(move);
    entry.rowIds.push(w.id);
    byUser.set(w.account_id, entry);
  }

  let sent = 0;
  for (const [userId, entry] of byUser.entries()) {
    const user = usersById.get(userId);
    if (!user?.email) continue;
    const name = user.display_name?.split(" ")[0] ?? user.email.split("@")[0];
    try {
      await sendEmail({
        to: user.email,
        subject: `${entry.moves.length} watchlist tickers moved`,
        html: renderHtml(name, entry.moves),
        unsubscribeUrl: "https://blockid.au/dashboard/notifications",
      });
      sent++;
      const stamp = new Date().toISOString();
      for (const m of entry.moves) {
        await supabase.from("watchlist")
          .update({ last_digest_svi: m.newSvi, last_digest_stage: m.newStage, last_digest_at: stamp })
          .eq("id", entry.rowIds[entry.moves.indexOf(m)]);
      }
    } catch (e) {
      console.error("[watchlist-digest] send failed for", user.email, e);
    }
  }

  return NextResponse.json({ ok: true, users: byUser.size, sent });
}

export async function GET(req: Request): Promise<NextResponse> {
  return POST(req);
}
