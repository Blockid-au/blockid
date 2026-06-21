// POST/GET /api/cron/lead-nurture — D1 / D4 / D9 post-signup sequence
//
// Three-touch warm sequence:
//   D1 (welcome + quickstart) → D4 (check-in + boost score) → D9 (Founding 100 last call)
//
// Runs daily. Fires at most one email per user per cron run. Uses svi_notifications
// table (notification_type) for idempotency, so each step sends exactly once per user.
// Honours email-preferences "promotions" opt-out (each send* helper checks first).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendD1Welcome,
  sendD4CheckIn,
  sendD9LastCall,
} from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Step {
  type: string;
  daysAfter: number;
  window: number;            // also fire if user is between [daysAfter, daysAfter + window] days old
  send: (args: { to: string; name?: string | null; svi?: number | null }) => Promise<{ ok: boolean; reason?: string }>;
}

const STEPS: Step[] = [
  { type: "lead_d1", daysAfter: 1, window: 1, send: sendD1Welcome },
  { type: "lead_d4", daysAfter: 4, window: 1, send: sendD4CheckIn },
  { type: "lead_d9", daysAfter: 9, window: 2, send: sendD9LastCall },
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const { data: accounts } = await supabase
      .from("svi_accounts")
      .select("id, email, name, current_svi, created_at")
      .order("created_at", { ascending: false });

    const now = Date.now();
    const MAX_BATCH = 50;
    let sent = 0;
    let skipped = 0;
    let opted_out = 0;

    for (const account of (accounts ?? []).slice(0, MAX_BATCH)) {
      if (!account.email || !account.created_at) continue;

      const daysSince = Math.floor((now - new Date(account.created_at).getTime()) / 86_400_000);
      const firstName = account.name?.split(" ")[0] ?? null;

      for (const step of STEPS) {
        if (daysSince < step.daysAfter) continue;
        if (daysSince > step.daysAfter + step.window) continue;

        const { count } = await supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true })
          .eq("email", account.email)
          .eq("notification_type", step.type);
        if ((count ?? 0) > 0) { skipped++; continue; }

        const result = await step.send({
          to: account.email,
          name: firstName,
          svi: account.current_svi ?? null,
        });

        if (!result.ok) {
          if (result.reason === "unsubscribed") { opted_out++; continue; }
          skipped++;
          continue;
        }

        await supabase.from("svi_notifications").insert({
          email: account.email,
          account_id: account.id,
          notification_type: step.type,
        });

        sent++;
        break; // 1 email per user per run
      }
    }

    return NextResponse.json({ ok: true, sent, skipped, opted_out, policy: "d1_d4_d9_sequence" });
  } catch (err) {
    console.error("[lead-nurture]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
