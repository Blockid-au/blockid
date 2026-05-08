import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/lead
// Captures a lead from the marketing surfaces. Persists to Supabase if
// configured, otherwise logs to console. Always returns { ok: true } on a
// well-formed request — we never want to block the funnel on infra issues.
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { source, email, payload } =
    (body as {
      source?: string;
      email?: string;
      payload?: unknown;
    }) ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!source || typeof source !== "string") {
    return NextResponse.json(
      { ok: false, error: "source is required" },
      { status: 400 },
    );
  }

  const safePayload =
    payload && typeof payload === "object" ? payload : {};

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("leads").insert({
      email,
      source,
      payload: safePayload,
    });
    if (error) {
      // Don't block the funnel — log and still return ok.
      console.error("[blockid:lead] Supabase insert failed", error);
    }
  } else {
    console.warn("[blockid:lead] Supabase not configured — logging only", {
      at: new Date().toISOString(),
      source,
      email,
      payload: safePayload,
    });
  }

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
