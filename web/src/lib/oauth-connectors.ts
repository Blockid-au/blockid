import "server-only";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export type OAuthProvider = "github" | "stripe" | "ga4";

export interface OAuthConnection {
  id: string;
  userId: string;
  projectId: string | null;
  provider: OAuthProvider;
  providerAccountId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  scopes: string[];
  expiresAt: string | null;
  status: "active" | "revoked" | "error";
  lastSyncAt: string | null;
  lastSyncError: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// AES-256-GCM at rest. Falls back to a base64 "obf:" wrapper when
// OAUTH_TOKEN_ENCRYPTION_KEY is unset so local dev doesn't 500 — a later
// hardening pass just needs to set the env var.
function getKey(): Buffer | null {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  if (raw.length === 64) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const key = getKey();
  if (!key) return `obf:${Buffer.from(plain, "utf8").toString("base64")}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (payload.startsWith("obf:")) {
    return Buffer.from(payload.slice(4), "base64").toString("utf8");
  }
  if (payload.startsWith("gcm:")) {
    const [, ivB64, tagB64, dataB64] = payload.split(":");
    const key = getKey();
    if (!key) return null;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  }
  return payload;
}

interface OAuthConnectionRow {
  id: string;
  user_id: string;
  project_id: string | null;
  provider: OAuthProvider;
  provider_account_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  status: "active" | "revoked" | "error";
  last_sync_at: string | null;
  last_sync_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function rowToConnection(row: OAuthConnectionRow): OAuthConnection {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConnection(
  userId: string,
  provider: OAuthProvider,
  projectId: string | null = null,
): Promise<OAuthConnection | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const query = supabase
    .from("oauth_connections_v2")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider);
  if (projectId) query.eq("project_id", projectId);
  else query.is("project_id", null);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return rowToConnection(data as OAuthConnectionRow);
}

export async function listConnections(userId: string): Promise<OAuthConnection[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("oauth_connections_v2")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as OAuthConnectionRow[]).map(rowToConnection);
}

export interface SaveConnectionArgs {
  userId: string;
  projectId?: string | null;
  provider: OAuthProvider;
  providerAccountId: string | null;
  accessToken: string;
  refreshToken?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export async function saveConnection(
  args: SaveConnectionArgs,
): Promise<OAuthConnection | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const existing = await getConnection(
    args.userId,
    args.provider,
    args.projectId ?? null,
  );

  const payload = {
    user_id: args.userId,
    project_id: args.projectId ?? null,
    provider: args.provider,
    provider_account_id: args.providerAccountId,
    access_token_encrypted: encrypt(args.accessToken),
    refresh_token_encrypted: encrypt(args.refreshToken ?? null),
    scopes: args.scopes ?? [],
    expires_at: args.expiresAt ?? null,
    status: "active" as const,
    metadata: args.metadata ?? {},
    updated_at: new Date().toISOString(),
    last_sync_error: null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("oauth_connections_v2")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error || !data) return null;
    return rowToConnection(data as OAuthConnectionRow);
  }

  const { data, error } = await supabase
    .from("oauth_connections_v2")
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error || !data) return null;
  return rowToConnection(data as OAuthConnectionRow);
}

export async function markSynced(
  id: string,
  error?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("oauth_connections_v2")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: error ?? null,
      status: error ? "error" : "active",
    })
    .eq("id", id);
}

export async function revokeConnection(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from("oauth_connections_v2")
    .update({
      status: "revoked",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  switch (provider) {
    case "github":
      return Boolean(
        process.env.GITHUB_OAUTH_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID,
      );
    case "stripe":
      return Boolean(
        process.env.STRIPE_OAUTH_CLIENT_ID ?? process.env.STRIPE_CLIENT_ID,
      );
    case "ga4":
      return Boolean(
        process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
      );
  }
}

export interface SignalUpsert {
  key: string;
  numeric?: number | null;
  text?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeSignals(
  userId: string,
  projectId: string | null,
  provider: OAuthProvider,
  signals: SignalUpsert[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || signals.length === 0) return;
  const now = new Date().toISOString();
  const rows = signals.map((s) => ({
    user_id: userId,
    project_id: projectId,
    provider,
    signal_key: s.key,
    signal_value_num: s.numeric ?? null,
    signal_value_text: s.text ?? null,
    metadata: s.metadata ?? {},
    captured_at: now,
  }));
  await supabase
    .from("svi_signals")
    .upsert(rows, {
      onConflict: "user_id,provider,signal_key,project_id",
      ignoreDuplicates: false,
    });
}
