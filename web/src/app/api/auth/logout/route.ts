import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";

// POST /api/auth/logout — clears cookie + deletes session row, then redirect home.
// @rate-limit-exempt — only ends the caller's own session (no AI, e-mail or outbound call).
async function POST_handler() {
  await destroySession();
  // 303, not the 307 default: a 307 makes the browser (and every
  // `fetch(…, { method: "POST" })` caller) re-POST to "/", which the live
  // log shows answering 405 after every sign-out (G36-A). 303 = follow with GET.
  return NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au"),
    303,
  );
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/logout/route.ts", method: "POST" }, POST_handler);
