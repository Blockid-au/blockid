import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all accounts with recent svi_analyses
    const { data: accounts, error } = await supabase
      .from("svi_accounts")
      .select("id, email, current_svi, current_stage");

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    let processed = 0;

    for (const account of accounts ?? []) {
      // Get the most recent analysis for this account
      const { data: analysis } = await supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json")
        .eq("email", account.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!analysis) continue;

      // Get prior snapshot for delta
      const { data: prior } = await supabase
        .from("svi_snapshots")
        .select("svi_total")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      const delta = prior ? analysis.total_svi - prior.svi_total : null;

      // Insert snapshot (upsert in case cron runs twice)
      await supabase.from("svi_snapshots").upsert({
        account_id: account.id,
        svi_total: analysis.total_svi,
        stage: account.current_stage,
        analysis_json: analysis.analysis_json,
        snapshot_date: today,
        delta,
      }, { onConflict: "account_id,snapshot_date" });

      // Update account current SVI
      await supabase.from("svi_accounts").update({
        current_svi: analysis.total_svi,
        last_active_at: new Date().toISOString(),
      }).eq("id", account.id);

      processed++;
    }

    return NextResponse.json({ ok: true, processed, date: today });
  } catch (err) {
    console.error("svi-snapshot cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
