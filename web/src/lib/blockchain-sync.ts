// Blockchain sync engine (server-only).
//
// Off-chain first: all equity data lives in Supabase (source of truth).
// Blockchain sync is an optional, toggleable transparency layer.
//
// Sync states per startup:
//   - off: no blockchain interaction
//   - on: real-time sync (events processed immediately)
//   - paused: sync stopped, events queue
//   - catching_up: processing all queued events, then transitions to 'on'

import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncState = "off" | "on" | "paused" | "catching_up";

export type SyncEventType =
  | "mint"
  | "burn"
  | "transfer"
  | "vest_grant"
  | "vest_revoke"
  | "vest_accelerate"
  | "dividend_declare"
  | "configure_class"
  | "attach_document";

export type SyncEventStatus = "pending" | "processing" | "synced" | "failed" | "skipped";

export interface SyncConfig {
  id: string;
  accountId: string;
  syncEnabled: boolean;
  syncState: SyncState;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenName: string | null;
  lastSyncAt: string | null;
  lastSyncBlock: number | null;
  pendingEvents: number;
  autoSyncTransfers: boolean;
}

export interface SyncEvent {
  id: string;
  accountId: string;
  eventType: SyncEventType;
  payload: Record<string, unknown>;
  priority: number;
  status: SyncEventStatus;
  txHash: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  processedAt: string | null;
}

export interface SyncResult {
  processed: number;
  synced: number;
  failed: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Get sync config for an account
// ---------------------------------------------------------------------------

export async function getSyncConfig(accountId: string): Promise<SyncConfig | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("blockchain_sync_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    accountId: data.account_id,
    syncEnabled: data.sync_enabled,
    syncState: data.sync_state as SyncState,
    tokenAddress: data.token_address,
    tokenSymbol: data.token_symbol,
    tokenName: data.token_name,
    lastSyncAt: data.last_sync_at,
    lastSyncBlock: data.last_sync_block,
    pendingEvents: data.pending_events,
    autoSyncTransfers: data.auto_sync_transfers,
  };
}

// ---------------------------------------------------------------------------
// Create or update sync config
// ---------------------------------------------------------------------------

export async function upsertSyncConfig(
  accountId: string,
  updates: Partial<Omit<SyncConfig, "id" | "accountId">>,
): Promise<{ ok: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false };

  const row: Record<string, unknown> = {
    account_id: accountId,
    updated_at: new Date().toISOString(),
  };

  if (updates.syncEnabled !== undefined) row.sync_enabled = updates.syncEnabled;
  if (updates.syncState !== undefined) row.sync_state = updates.syncState;
  if (updates.tokenAddress !== undefined) row.token_address = updates.tokenAddress;
  if (updates.tokenSymbol !== undefined) row.token_symbol = updates.tokenSymbol;
  if (updates.tokenName !== undefined) row.token_name = updates.tokenName;
  if (updates.lastSyncAt !== undefined) row.last_sync_at = updates.lastSyncAt;
  if (updates.lastSyncBlock !== undefined) row.last_sync_block = updates.lastSyncBlock;
  if (updates.autoSyncTransfers !== undefined) row.auto_sync_transfers = updates.autoSyncTransfers;

  const { error } = await supabase
    .from("blockchain_sync_config")
    .upsert(row, { onConflict: "account_id" });

  if (error) {
    console.error("[blockchain-sync] upsert config failed", error);
    return { ok: false };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Queue a sync event
// ---------------------------------------------------------------------------

export async function queueSyncEvent(
  accountId: string,
  eventType: SyncEventType,
  payload: Record<string, unknown>,
  priority: number = 0,
): Promise<{ ok: boolean; eventId?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false };

  const { data, error } = await supabase
    .from("blockchain_sync_queue")
    .insert({
      account_id: accountId,
      event_type: eventType,
      payload,
      priority,
      status: "pending",
      retry_count: 0,
      max_retries: 3,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[blockchain-sync] queue event failed", error);
    return { ok: false };
  }

  // Increment pending count
  try {
    await supabase.rpc("increment_pending_events", { p_account_id: accountId });
  } catch {
    // Non-critical — pending count is advisory
  }

  return { ok: true, eventId: data?.id };
}

// ---------------------------------------------------------------------------
// Toggle sync state
// ---------------------------------------------------------------------------

export async function toggleSync(
  accountId: string,
  action: "enable" | "disable" | "pause" | "catch_up",
): Promise<{ ok: boolean; newState: SyncState }> {
  let newState: SyncState;

  switch (action) {
    case "enable":
      newState = "on";
      break;
    case "disable":
      newState = "off";
      break;
    case "pause":
      newState = "paused";
      break;
    case "catch_up":
      newState = "catching_up";
      break;
  }

  const updates: Partial<SyncConfig> = {
    syncEnabled: action === "enable" || action === "catch_up",
    syncState: newState,
  };

  const result = await upsertSyncConfig(accountId, updates);
  return { ok: result.ok, newState };
}

// ---------------------------------------------------------------------------
// Process sync queue for an account
// ---------------------------------------------------------------------------

export async function processSyncQueue(accountId: string): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { processed: 0, synced: 0, failed: 0, remaining: 0 };

  const config = await getSyncConfig(accountId);
  if (!config || !config.syncEnabled || config.syncState === "off") {
    return { processed: 0, synced: 0, failed: 0, remaining: 0 };
  }

  if (!config.tokenAddress) {
    // No token deployed yet — can't sync
    return { processed: 0, synced: 0, failed: 0, remaining: config.pendingEvents };
  }

  // Fetch pending events (ordered by priority DESC, created_at ASC)
  const { data: events } = await supabase
    .from("blockchain_sync_queue")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20); // Process in batches of 20

  if (!events || events.length === 0) {
    // If catching up and no more events, transition to 'on'
    if (config.syncState === "catching_up") {
      await upsertSyncConfig(accountId, { syncState: "on" });
    }
    return { processed: 0, synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const event of events) {
    // Mark as processing
    await supabase
      .from("blockchain_sync_queue")
      .update({ status: "processing" })
      .eq("id", event.id);

    try {
      // Execute on-chain transaction
      const txHash = await executeOnChainTx(config, event);

      // Mark as synced
      await supabase
        .from("blockchain_sync_queue")
        .update({
          status: "synced",
          tx_hash: txHash,
          processed_at: new Date().toISOString(),
        })
        .eq("id", event.id);

      synced++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newRetryCount = (event.retry_count || 0) + 1;
      const newStatus = newRetryCount >= (event.max_retries || 3) ? "failed" : "pending";

      await supabase
        .from("blockchain_sync_queue")
        .update({
          status: newStatus,
          error_message: errorMsg,
          retry_count: newRetryCount,
          processed_at: new Date().toISOString(),
        })
        .eq("id", event.id);

      if (newStatus === "failed") failed++;
      console.error(`[blockchain-sync] event ${event.id} failed:`, errorMsg);
    }
  }

  // Update pending count and last sync time
  const { count } = await supabase
    .from("blockchain_sync_queue")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "pending");

  await upsertSyncConfig(accountId, {
    lastSyncAt: new Date().toISOString(),
    pendingEvents: count ?? 0,
  });

  // If catching up and no more pending, transition to 'on'
  if (config.syncState === "catching_up" && (count ?? 0) === 0) {
    await upsertSyncConfig(accountId, { syncState: "on" });
  }

  return {
    processed: events.length,
    synced,
    failed,
    remaining: count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Execute on-chain transaction (stub — actual wallet.ts calls go here)
// ---------------------------------------------------------------------------

async function executeOnChainTx(
  config: SyncConfig,
  event: SyncEvent,
): Promise<string> {
  // This function dispatches to the appropriate wallet.ts function
  // based on event type. Currently returns a placeholder tx hash.
  //
  // In production, this imports from wallet.ts and calls:
  //   mint → mintTokens(config.tokenAddress, payload.to, payload.amount)
  //   transfer → forcedTransfer(config.tokenAddress, ...)
  //   vest_grant → grantVesting(config.tokenAddress, ...)
  //   etc.
  //
  // For now, we use server-side signing (admin key from GCP Secret Manager).

  const { eventType, payload } = event;

  // TODO: Replace with actual wallet.ts calls when admin key is configured
  console.log(`[blockchain-sync] executing ${eventType}:`, payload);

  // Placeholder — return a deterministic "tx hash" for testing
  const hash = `0x${Buffer.from(`${event.id}-${Date.now()}`).toString("hex").slice(0, 64)}`;
  return hash;
}

// ---------------------------------------------------------------------------
// Get sync queue status for dashboard
// ---------------------------------------------------------------------------

export async function getSyncQueueStatus(accountId: string): Promise<{
  pending: number;
  synced: number;
  failed: number;
  recentEvents: SyncEvent[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { pending: 0, synced: 0, failed: 0, recentEvents: [] };

  const [pendingRes, syncedRes, failedRes, recentRes] = await Promise.all([
    supabase.from("blockchain_sync_queue").select("*", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "pending"),
    supabase.from("blockchain_sync_queue").select("*", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "synced"),
    supabase.from("blockchain_sync_queue").select("*", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "failed"),
    supabase.from("blockchain_sync_queue").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    pending: pendingRes.count ?? 0,
    synced: syncedRes.count ?? 0,
    failed: failedRes.count ?? 0,
    recentEvents: (recentRes.data ?? []) as unknown as SyncEvent[],
  };
}
