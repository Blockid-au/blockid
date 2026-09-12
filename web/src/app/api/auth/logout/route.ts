import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";

// POST /api/auth/logout — clears cookie + deletes session row, then redirect home.
async function POST_handler() {
  await destroySession();
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"),
  );
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/logout/route.ts", method: "POST" }, POST_handler);
