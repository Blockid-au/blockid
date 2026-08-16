// POST /api/feedback/submit — T_FEEDBACK_0001
//
// Authenticated users submit product feedback and earn credits after AI review.
// Rate limit: 5 submissions per hour per user.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FeedbackBody = z.object({
  category: z.enum(["product", "ux", "feature", "bug", "other"]),
  body: z.string().min(50, "Feedback must be at least 50 characters").max(2000, "Feedback must be 2000 characters or fewer"),
  rating: z.number().int().min(1).max(5),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 submissions per hour per user
  const limited = enforceRateLimit("feedback-submit", user.id, request, 5, 3_600_000);
  if (limited) return limited;

  let payload: z.infer<typeof FeedbackBody>;
  try {
    payload = FeedbackBody.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues.map((i: z.ZodIssue) => i.message).join("; ")
        : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("feedback_submissions")
    .insert({
      user_id: user.id,
      category: payload.category,
      body: payload.body,
      rating: payload.rating,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[feedback:submit] db error", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: data.id,
      message:
        "Feedback received! Credits awarded after AI review (usually within 1 hour).",
    },
    { status: 201 },
  );
}
