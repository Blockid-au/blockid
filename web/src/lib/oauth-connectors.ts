import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sealToken, openToken } from "@/lib/oauth-token-seal";

export type OAuthProvider = "github" | "stripe" | "ga4";

export interface OAuthConnection {
  id: string;
  userId: string;
  projectId: string | null;
  provider: OAuthProvider;
  providerAccountId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /**
   * S23-A — a token IS stored but could not be opened (plaintext-equivalent
   * row refused while a key is set, or a `gcm:` payload no configured key
   * opens). The connector must show "reconnect" rather than "connected".
   */
  tokenUnreadable: boolean;
  scopes: string[];
  expiresAt: string | null;
  status: "active" | "revoked" | "error";
  lastSyncAt: string | null;
  lastSyncError: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// S23-A — tokens are sealed by `lib/oauth-token-seal.ts` (AES-256-GCM,
// fail-closed open, previous-key rotation). `encrypt`/`decrypt` stay as the
// historical names for this vault; both delegate.
export {
  sealToken,
  openToken,
  resealToken,
  classifyToken,
  isPlaintextEquivalent,
  OAuthSealKeyMissingError,
} from "@/lib/oauth-token-seal";

export function encrypt(plain: string | null | undefined): string | null {
  return sealToken(plain);
}

export function decrypt(payload: string | null | undefined): string | null {
  return openToken(payload);
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
  const accessToken = openToken(row.access_token_encrypted);
  const refreshToken = openToken(row.refresh_token_encrypted);
  const tokenUnreadable =
    (Boolean(row.access_token_encrypted) && accessToken === null) ||
    (Boolean(row.refresh_token_encrypted) && refreshToken === null);
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    accessToken,
    refreshToken,
    tokenUnreadable,
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
    access_token_encrypted: sealToken(args.accessToken),
    refresh_token_encrypted: sealToken(args.refreshToken ?? null),
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
