// /api/watchlist — GET list / POST toggle for the current signed-in user.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listWatchlist, toggleWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to view your watchlist." }, { status: 401 });
  const rows = await listWatchlist(user.id);
  return NextResponse.json({ ok: true, rows }, {
    headers: { "Access-Control-Allow-Origin": "https://startupvalueindex.com", "Access-Control-Allow-Credentials": "true" },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to use your watchlist." }, { status: 401 });

  let body: { ticker?: string; slug?: string; notes?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const ticker = (body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/.test(ticker)) {
    return NextResponse.json({ ok: false, error: "Invalid ticker format" }, { status: 400 });
  }

  const result = await toggleWatchlist({
    accountId: user.id,
    ticker,
    slug: body.slug?.toString().slice(0, 100),
    notes: body.notes?.toString().slice(0, 500),
  });

  return NextResponse.json({ ok: true, ...result }, {
    headers: { "Access-Control-Allow-Origin": "https://startupvalueindex.com", "Access-Control-Allow-Credentials": "true" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://startupvalueindex.com",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
