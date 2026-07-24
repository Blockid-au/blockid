// GET /api/cron/investor-weekly-digest
//
// P7 track — docs/plans/atlassian-standard-mapping-goal.md
//   §P7_weekly_digest_integration.
//
// Weekly digest for active investors (angel + VC). For each investor
// active in the last 30 days, look up their watchlist and email the top
// 5 tickers by absolute SVI change since the last digest. Non-blocking:
// if the investor has no watchlisted startups, send an empty-state
// digest that points at the browse-catalog surface.
//
// Auth: shared CRON_SECRET Bearer pattern (matches sibling cron routes
//   under web/src/app/api/cron/**).
// Kill switch: env INVESTOR_DIGEST=off short-circuits the endpoint.
// Query params:
//   - skip_email=1 → dry-run (compute rows + subjects, DO NOT send)
//
// This route does NOT touch the host crontab — install a curl line per
// docs/ops/crontab-setup.md.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildInvestorDigest,
  type InvestorDigestTickerRow,
} from "@/lib/email/investor-digest";
import { computeListings } from "@/lib/startup-index-listings";
import { getUnsubscribeUrl } from "@/lib/email-preferences";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const INVESTOR_SEGMENTS = ["investor_angel", "investor_vc"] as const;
const LAST_LOGIN_WINDOW_DAYS = 30;
const TOP_N = 5;

// Investor account row from app_users (segment + last_login_at gated).
interface InvestorRow {
  id: string;
  email: string;
  display_name: string | null;
  last_login_at: string | null;
}

// Watchlist row shape shared with the sibling watchlist-digest cron
// (see web/src/app/api/cron/watchlist-digest/route.ts).
interface WatchRow {
  id: string;
  account_id: string;
  ticker: string;
  slug: string | null;
  last_digest_svi: number | null;
  last_digest_stage: number | null;
  last_digest_at: string | null;
}

interface DryRunSummary {
  investor_id: string;
  email: string;
  ticker_count: number;
  is_empty: boolean;
  subject: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (process.env.INVESTOR_DIGEST === "off") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";

  // ---- 1. Active investors in the last 30 days --------------------
  const cutoff = new Date(
    Date.now() - LAST_LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: investorsData, error: investorsErr } = await supabase
    .from("app_users")
    .select("id, email, display_name, last_login_at")
    .in("segment", INVESTOR_SEGMENTS as unknown as string[])
    .gte("last_login_at", cutoff);

  if (investorsErr) {
    return NextResponse.json(
      {
        ok: false,
        reason: "investors_query_failed",
        error: investorsErr.message,
      },
      { status: 500 },
    );
  }
  const investors = (investorsData ?? []) as InvestorRow[];

  if (investors.length === 0) {
    return NextResponse.json({ ok: true, investor_count: 0, emailed: 0 });
  }

  // ---- 2. Watchlist rows for those investors ----------------------
  const investorIds = investors.map((i) => i.id);
  const { data: watchRowsData, error: watchErr } = await supabase
    .from("watchlist")
    .select(
      "id, account_id, ticker, slug, last_digest_svi, last_digest_stage, last_digest_at",
    )
    .in("account_id", investorIds);
  if (watchErr) {
    return NextResponse.json(
      { ok: false, reason: "watchlist_query_failed", error: watchErr.message },
      { status: 500 },
    );
  }
  const watchRows = (watchRowsData ?? []) as WatchRow[];

  const watchByInvestor = new Map<string, WatchRow[]>();
  for (const w of watchRows) {
    const arr = watchByInvestor.get(w.account_id) ?? [];
    arr.push(w);
    watchByInvestor.set(w.account_id, arr);
  }

  // ---- 3. Snapshot of the market so we can price each ticker ------
  // computeListings() is the same lookup the /listings page + the sibling
  // watchlist-digest cron use — one shot, reused across investors.
  let latestByTicker = new Map<
    string,
    { svi: number; slug: string; sectorLabel: string; stageLabel: string }
  >();
  try {
    const indexed = await computeListings({
      filter: { sector: "all", stage: "all", publicOnly: false, revenueOnly: false },
      sort: "svi",
      order: "desc",
      page: 1,
      pageSize: 1000,
    });
    for (const r of indexed.rows) {
      latestByTicker.set(r.ticker, {
        svi: r.svi,
        slug: r.slug,
        sectorLabel: r.sectorLabel,
        stageLabel: r.stageLabel,
      });
    }
  } catch (err) {
    console.warn("[investor-weekly-digest] computeListings failed", err);
    latestByTicker = new Map();
  }

  // ---- 4. Compose + send per investor -----------------------------
  const dryRun: DryRunSummary[] = [];
  let emailed = 0;
  let failures = 0;
  const now = new Date();
  const nowIso = now.toISOString();

  for (const investor of investors) {
    if (!investor.email) continue;

    const watchlist = watchByInvestor.get(investor.id) ?? [];

    const enriched: Array<{
      row: WatchRow;
      out: InvestorDigestTickerRow;
      absDelta: number;
    }> = [];

    for (const w of watchlist) {
      const latest = latestByTicker.get(w.ticker);
      if (!latest) continue;
      const delta =
        w.last_digest_svi === null || w.last_digest_svi === undefined
          ? null
          : Number((latest.svi - w.last_digest_svi).toFixed(2));
      enriched.push({
        row: w,
        out: {
          ticker: w.ticker,
          slug: latest.slug,
          svi: latest.svi,
          deltaSinceLastDigest: delta,
          latestPhaseLabel: latest.stageLabel,
          sectorLabel: latest.sectorLabel,
        },
        absDelta: Math.abs(delta ?? Number.POSITIVE_INFINITY),
      });
    }

    // Sort by biggest absolute movement first; new tickers (delta=null)
    // sort to the top because `Number.POSITIVE_INFINITY` beats every
    // finite abs-delta.
    enriched.sort((a, b) => b.absDelta - a.absDelta);
    const top = enriched.slice(0, TOP_N).map((e) => e.out);

    const name = investor.display_name || investor.email.split("@")[0];
    const isEmpty = top.length === 0;
    const unsubscribeUrl = getUnsubscribeUrl({
      email: investor.email,
      preference: "weekly_summary",
    });

    const digest = buildInvestorDigest({
      name,
      tickers: top,
      isEmpty,
      browseUrl: "https://blockid.au/listings",
      watchlistUrl: "https://blockid.au/dashboard/watchlist",
      unsubscribeUrl,
    });

    if (skipEmail) {
      dryRun.push({
        investor_id: investor.id,
        email: investor.email,
        ticker_count: top.length,
        is_empty: isEmpty,
        subject: digest.subject,
      });
      continue;
    }

    try {
      const res = await sendEmail({
        to: investor.email,
        subject: digest.subject,
        html: digest.html,
        preferenceKey: "weekly_summary",
        unsubscribeUrl,
      });
      if (res && (res as { ok?: boolean }).ok !== false) {
        emailed++;
        // Snapshot the latest SVI so next week's delta is measured from
        // this digest (mirrors the sibling watchlist-digest write-back).
        for (const e of enriched.slice(0, TOP_N)) {
          const latest = latestByTicker.get(e.row.ticker);
          if (!latest) continue;
          await supabase
            .from("watchlist")
            .update({
              last_digest_svi: latest.svi,
              last_digest_at: nowIso,
            })
            .eq("id", e.row.id);
        }
      } else {
        failures++;
      }
    } catch (err) {
      failures++;
      console.warn(
        "[investor-weekly-digest] send failed for",
        investor.email,
        err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    investor_count: investors.length,
    emailed,
    failures,
    dry_run: skipEmail ? dryRun : undefined,
  });
}
