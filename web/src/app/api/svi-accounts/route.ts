import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const { email, name, startup_name, plan } = await request.json() as {
      email: string;
      name?: string;
      startup_name?: string;
      plan?: string;
    };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    // Verify the requesting user owns this email to prevent enumeration
    if (email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Email does not match authenticated user" },
        { status: 403 },
      );
    }

    // Upsert account
    const { data, error } = await supabase
      .from("svi_accounts")
      .upsert({
        email,
        name: name ?? null,
        startup_name: startup_name ?? null,
        plan: plan ?? "founding50",
        last_active_at: new Date().toISOString(),
      }, { onConflict: "email" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, account: data });
  } catch (err) {
    console.error("svi-accounts error:", err);
    return NextResponse.json({ ok: false, error: "Failed to create account" }, { status: 500 });
  }
}
