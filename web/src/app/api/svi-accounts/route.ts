import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
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
