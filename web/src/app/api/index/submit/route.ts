// POST /api/index/submit (T-1301)
//
// Public, unauthenticated endpoint that receives startup submissions from /submit.
// Validates with Zod, writes to public_index_submissions, notifies admin via Telegram.
// No auth required — this is an inbound marketing funnel endpoint.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
const INDUSTRIES = [
  "fintech",
  "saas",
  "ai",
  "healthtech",
  "marketplace",
  "deeptech",
  "ecommerce",
  "other",
] as const;
const STAGES = ["idea", "mvp", "revenue", "growth", "scale"] as const;

const SubmitBody = z.object({
  startup_name:      z.string().min(1, "Startup name is required").max(200),
  tagline:           z.string().min(1, "Tagline is required").max(120, "Tagline must be 120 characters or fewer"),
  state:             z.enum(AU_STATES).optional(),
  industry:          z.enum(INDUSTRIES).optional(),
  stage:             z.enum(STAGES).optional(),
  website_url:       z.string().url("Must be a valid URL").optional().or(z.literal("")),
  contact_email:     z.string().email("A valid email address is required"),
  is_public_opt_in:  z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  // IP-based rate limit: 5 submissions per hour per IP.
  const limited = enforceRateLimit("index-submit", null, request, 5, 3_600_000);
  if (limited) return limited;

  let payload: z.infer<typeof SubmitBody>;
  try {
    payload = SubmitBody.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError
      ? err.issues.map((issue: z.ZodIssue) => issue.message).join("; ")
      : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { error: dbError } = await supabase
    .from("public_index_submissions")
    .insert([
      {
        startup_name:     payload.startup_name,
        tagline:          payload.tagline,
        state:            payload.state ?? null,
        industry:         payload.industry ?? null,
        stage:            payload.stage ?? null,
        website_url:      payload.website_url || null,
        contact_email:    payload.contact_email,
        is_public_opt_in: payload.is_public_opt_in,
        status:           "pending",
      },
    ]);

  if (dbError) {
    console.error("[index:submit] db error", dbError);
    return NextResponse.json({ error: "Failed to save submission" }, { status: 500 });
  }

  // Notify admin via Telegram (fire-and-forget — never block the response).
  void sendTelegram(
    `📋 *New Startup Submission*\n` +
    `*Name:* ${mdEscape(payload.startup_name)}\n` +
    `*Tagline:* ${mdEscape(payload.tagline)}\n` +
    `*Industry:* ${payload.industry ?? "—"} | *Stage:* ${payload.stage ?? "—"} | *State:* ${payload.state ?? "—"}\n` +
    `*Website:* ${payload.website_url ? mdEscape(payload.website_url) : "—"}\n` +
    `*Email:* ${mdEscape(payload.contact_email)}\n` +
    `*Public opt-in:* ${payload.is_public_opt_in ? "Yes" : "No"}`,
  );

  return NextResponse.json(
    { ok: true, message: "Submission received" },
    { status: 200 },
  );
}
