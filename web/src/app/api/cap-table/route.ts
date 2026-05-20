import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cap-table — full cap table for the logged-in user
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  const accountId = user.id;

  // Fetch share classes, shareholders, ESOP pool in parallel
  const [classesRes, holdersRes, esopRes] = await Promise.all([
    supabase
      .from("share_classes")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("shareholders")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true }),
    supabase
      .from("esop_pool")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);

  if (classesRes.error || holdersRes.error || esopRes.error) {
    console.error("[cap-table] fetch error", classesRes.error, holdersRes.error, esopRes.error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch cap table" },
      { status: 500 },
    );
  }

  const shareClasses = classesRes.data ?? [];
  const shareholders = holdersRes.data ?? [];
  const esopPool = esopRes.data ?? null;

  // Compute totals
  const totalAuthorized = shareClasses.reduce(
    (sum: number, c: { total_authorized: number }) => sum + Number(c.total_authorized),
    0,
  );
  const totalIssued = shareholders.reduce(
    (sum: number, s: { shares_held: number }) => sum + Number(s.shares_held),
    0,
  );

  // Compute ownership percentages (fully diluted includes ESOP pool)
  const esopShares = esopPool ? Number(esopPool.total_pool_shares) : 0;
  const fullyDilutedTotal = totalIssued + esopShares;

  const shareholdersWithPct = shareholders.map(
    (s: { shares_held: number; [key: string]: unknown }) => ({
      ...s,
      ownership_pct:
        fullyDilutedTotal > 0
          ? Number(((Number(s.shares_held) / fullyDilutedTotal) * 100).toFixed(2))
          : 0,
      fully_diluted_pct:
        fullyDilutedTotal > 0
          ? Number(((Number(s.shares_held) / fullyDilutedTotal) * 100).toFixed(2))
          : 0,
    }),
  );

  return NextResponse.json({
    ok: true,
    shareClasses,
    shareholders: shareholdersWithPct,
    esopPool,
    summary: {
      totalAuthorized,
      totalIssued,
      fullyDilutedTotal,
      esopShares,
      esopAvailable: esopShares - (esopPool ? Number(esopPool.allocated_shares) : 0),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/cap-table — add class / shareholder / issue shares / setup ESOP
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  let body: { action?: string; data?: Record<string, unknown> } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { action, data } = body;
  const accountId = user.id;

  if (!action || !data) {
    return NextResponse.json(
      { ok: false, error: "action and data are required" },
      { status: 400 },
    );
  }

  switch (action) {
    // ----- Add share class -----
    case "add_class": {
      const name = data.name as string;
      const classType = (data.classType as string) || "ordinary";
      const totalAuthorized = Number(data.totalAuthorized) || 10000000;
      const pricePerShare = Number(data.pricePerShare) || 0.001;
      const votingRights = data.votingRights !== false;
      const dividendPreference = data.dividendPreference != null ? Number(data.dividendPreference) : null;
      const liquidationPreference = data.liquidationPreference != null ? Number(data.liquidationPreference) : null;

      if (!name) {
        return NextResponse.json(
          { ok: false, error: "Class name is required" },
          { status: 400 },
        );
      }

      const { data: row, error } = await supabase
        .from("share_classes")
        .insert({
          account_id: accountId,
          name,
          class_type: classType,
          total_authorized: totalAuthorized,
          price_per_share: pricePerShare,
          voting_rights: votingRights,
          dividend_preference: dividendPreference,
          liquidation_preference: liquidationPreference,
        })
        .select()
        .single();

      if (error) {
        console.error("[cap-table] add_class error", error);
        return NextResponse.json({ ok: false, error: "Failed to add share class" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, shareClass: row }, { status: 201 });
    }

    // ----- Add shareholder -----
    case "add_shareholder": {
      const name = data.name as string;
      const email = (data.email as string) || null;
      const role = (data.role as string) || "founder";
      const shareClassId = (data.shareClassId as string) || null;
      const sharesHeld = Number(data.sharesHeld) || 0;
      const vestingStart = (data.vestingStart as string) || null;
      const vestingMonths = data.vestingMonths != null ? Number(data.vestingMonths) : 48;
      const cliffMonths = data.cliffMonths != null ? Number(data.cliffMonths) : 12;
      const notes = (data.notes as string) || null;

      if (!name) {
        return NextResponse.json(
          { ok: false, error: "Shareholder name is required" },
          { status: 400 },
        );
      }

      const { data: row, error } = await supabase
        .from("shareholders")
        .insert({
          account_id: accountId,
          name,
          email,
          role,
          share_class_id: shareClassId,
          shares_held: sharesHeld,
          vesting_start: vestingStart,
          vesting_months: vestingMonths,
          cliff_months: cliffMonths,
          notes,
        })
        .select()
        .single();

      if (error) {
        console.error("[cap-table] add_shareholder error", error);
        return NextResponse.json({ ok: false, error: "Failed to add shareholder" }, { status: 500 });
      }

      // Record the issue transaction if shares > 0
      if (sharesHeld > 0 && shareClassId) {
        await supabase.from("share_transactions").insert({
          account_id: accountId,
          transaction_type: "issue",
          to_shareholder_id: row.id,
          share_class_id: shareClassId,
          shares: sharesHeld,
          price_per_share: data.pricePerShare != null ? Number(data.pricePerShare) : null,
          total_value: data.pricePerShare != null ? sharesHeld * Number(data.pricePerShare) : null,
          round_name: (data.roundName as string) || "Founding",
          notes: `Initial issue to ${name}`,
        });
      }

      return NextResponse.json({ ok: true, shareholder: row }, { status: 201 });
    }

    // ----- Issue shares (add shares to existing shareholder) -----
    case "issue_shares": {
      const shareholderId = data.shareholderId as string;
      const shareClassId = data.shareClassId as string;
      const shares = Number(data.shares);

      if (!shareholderId || !shareClassId || !shares || shares <= 0) {
        return NextResponse.json(
          { ok: false, error: "shareholderId, shareClassId, and shares (> 0) are required" },
          { status: 400 },
        );
      }

      // Verify shareholder belongs to this account
      const { data: existing } = await supabase
        .from("shareholders")
        .select("id, shares_held")
        .eq("id", shareholderId)
        .eq("account_id", accountId)
        .single();

      if (!existing) {
        return NextResponse.json({ ok: false, error: "Shareholder not found" }, { status: 404 });
      }

      const newTotal = Number(existing.shares_held) + shares;
      const { error } = await supabase
        .from("shareholders")
        .update({ shares_held: newTotal, share_class_id: shareClassId })
        .eq("id", shareholderId);

      if (error) {
        console.error("[cap-table] issue_shares error", error);
        return NextResponse.json({ ok: false, error: "Failed to issue shares" }, { status: 500 });
      }

      // Record transaction
      await supabase.from("share_transactions").insert({
        account_id: accountId,
        transaction_type: "issue",
        to_shareholder_id: shareholderId,
        share_class_id: shareClassId,
        shares,
        price_per_share: data.pricePerShare != null ? Number(data.pricePerShare) : null,
        total_value: data.pricePerShare != null ? shares * Number(data.pricePerShare) : null,
        round_name: (data.roundName as string) || null,
        notes: (data.notes as string) || null,
      });

      return NextResponse.json({ ok: true, newSharesHeld: newTotal });
    }

    // ----- Setup ESOP -----
    case "setup_esop": {
      const totalPoolShares = Number(data.totalPoolShares) || 0;
      const poolPct = Number(data.poolPct) || 10;

      if (totalPoolShares <= 0) {
        return NextResponse.json(
          { ok: false, error: "totalPoolShares must be greater than 0" },
          { status: 400 },
        );
      }

      // Upsert the ESOP pool
      const { data: row, error } = await supabase
        .from("esop_pool")
        .upsert(
          {
            account_id: accountId,
            total_pool_shares: totalPoolShares,
            pool_pct: poolPct,
            allocated_shares: 0,
          },
          { onConflict: "account_id" },
        )
        .select()
        .single();

      if (error) {
        console.error("[cap-table] setup_esop error", error);
        return NextResponse.json({ ok: false, error: "Failed to setup ESOP" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, esopPool: row }, { status: 201 });
    }

    // ----- Update shareholder -----
    case "update_shareholder": {
      const shareholderId = data.shareholderId as string;
      if (!shareholderId) {
        return NextResponse.json({ ok: false, error: "shareholderId is required" }, { status: 400 });
      }

      // Verify ownership
      const { data: existing } = await supabase
        .from("shareholders")
        .select("id")
        .eq("id", shareholderId)
        .eq("account_id", accountId)
        .single();

      if (!existing) {
        return NextResponse.json({ ok: false, error: "Shareholder not found" }, { status: 404 });
      }

      const updates: Record<string, unknown> = {};
      if (data.name != null) updates.name = data.name;
      if (data.email != null) updates.email = data.email;
      if (data.role != null) updates.role = data.role;
      if (data.shareClassId != null) updates.share_class_id = data.shareClassId;
      if (data.sharesHeld != null) updates.shares_held = Number(data.sharesHeld);
      if (data.vestingStart != null) updates.vesting_start = data.vestingStart;
      if (data.vestingMonths != null) updates.vesting_months = Number(data.vestingMonths);
      if (data.cliffMonths != null) updates.cliff_months = Number(data.cliffMonths);
      if (data.notes != null) updates.notes = data.notes;
      if (data.evmAddress != null) updates.evm_address = data.evmAddress;

      const { data: row, error } = await supabase
        .from("shareholders")
        .update(updates)
        .eq("id", shareholderId)
        .select()
        .single();

      if (error) {
        console.error("[cap-table] update_shareholder error", error);
        return NextResponse.json({ ok: false, error: "Failed to update shareholder" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, shareholder: row });
    }

    default:
      return NextResponse.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cap-table — remove a shareholder
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  let body: { shareholderId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { shareholderId } = body;
  if (!shareholderId) {
    return NextResponse.json(
      { ok: false, error: "shareholderId is required" },
      { status: 400 },
    );
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from("shareholders")
    .select("id")
    .eq("id", shareholderId)
    .eq("account_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Shareholder not found" },
      { status: 404 },
    );
  }

  // Delete related transactions first
  await supabase
    .from("share_transactions")
    .delete()
    .or(`from_shareholder_id.eq.${shareholderId},to_shareholder_id.eq.${shareholderId}`);

  const { error } = await supabase
    .from("shareholders")
    .delete()
    .eq("id", shareholderId);

  if (error) {
    console.error("[cap-table] delete shareholder error", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete shareholder" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
