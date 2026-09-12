import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";

async function POST_handler(request: Request) {
  try {
    // QA-4 P2-b — an empty / malformed body is a 400, never a 500.
    const parsed = await readJsonBody<{ email?: unknown; name?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
    const { email, name } = body;

    if (!email || !name) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Insert into founding50_waitlist table
    const { error } = await supabase
      .from("founding50_waitlist")
      .insert([{ email, name }]);

    if (error) {
      // Handle duplicate email
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This email is already on the waitlist" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: "Successfully added to waitlist",
    });
  } catch (err) {
    console.error("[index:waitlist] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/index/waitlist/route.ts", method: "POST" }, POST_handler);
