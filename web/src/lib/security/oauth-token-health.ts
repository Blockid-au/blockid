// S23-A — "are the OAuth connector tokens sealed at rest?" signal.
//
// Surfaced on /api/status as `oauth_tokens_sealed` and as a dimension of the
// security-posture cron so the operator can see the migration state without
// opening psql:
//
//   no_key            OAUTH_TOKEN_ENCRYPTION_KEY is unset — every write is
//                     plaintext-equivalent (`obf:`) in dev and a 500 in prod
//   obf_rows_present  key set, but ≥1 stored token is still `obf:` / raw —
//                     run scripts/reseal-oauth-tokens.mjs --write
//   ok                key set and every stored token is `gcm:`
//   unknown           Supabase not configured / count query failed
//
// The counts are four cheap `head: true` COUNT queries (one per token
// column); the verdict is cached for 10 minutes per process so /api/status
// (30 s CDN cache, public) never becomes a DB hammer. Never reads token
// bytes — only whether the prefix is `gcm:`.

import { getSupabaseAdmin } from "@/lib/supabase";
import { currentKey, GCM_PREFIX } from "@/lib/oauth-token-seal";

export type OAuthTokensSealedStatus = "ok" | "obf_rows_present" | "no_key" | "unknown";

export interface OAuthTokenHealth {
  status: OAuthTokensSealedStatus;
  /** Rows with at least one unsealed (`obf:`/raw) token column, per table. Null when unknown. */
  unsealed: { oauth_connections_v2: number; oauth_connections: number } | null;
  checked_at: string;
}

/** Every column that stores a connector token, per table (single source for status + reseal). */
export const TOKEN_COLUMNS: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  { table: "oauth_connections_v2", columns: ["access_token_encrypted", "refresh_token_encrypted"] },
  { table: "oauth_connections", columns: ["access_token", "refresh_token"] },
];

export const OAUTH_TOKEN_HEALTH_TTL_MS = 10 * 60 * 1000;

let cache: { value: OAuthTokenHealth; at: number } | null = null;

export function _resetOAuthTokenHealthCache(): void {
  cache = null;
}

/** Count rows in `table` whose `column` is non-null and does NOT start with `gcm:`. */
async function countUnsealed(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  column: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .not(column, "is", null)
    .not(column, "like", `${GCM_PREFIX}%`);
  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  return count ?? 0;
}

export async function readOAuthTokenHealth(
  opts: { now?: number; env?: NodeJS.ProcessEnv; force?: boolean } = {},
): Promise<OAuthTokenHealth> {
  const now = opts.now ?? Date.now();
  const env = opts.env ?? process.env;
  if (!opts.force && cache && now - cache.at < OAUTH_TOKEN_HEALTH_TTL_MS) return cache.value;

  const checked_at = new Date(now).toISOString();
  const keyed = Boolean(currentKey(env));
  const db = getSupabaseAdmin();
  let value: OAuthTokenHealth;
  if (!db) {
    value = { status: keyed ? "unknown" : "no_key", unsealed: null, checked_at };
  } else {
    try {
      const perTable: Record<string, number> = {};
      for (const { table, columns } of TOKEN_COLUMNS) {
        let n = 0;
        for (const column of columns) n = Math.max(n, await countUnsealed(db, table, column));
        perTable[table] = n;
      }
      const unsealed = {
        oauth_connections_v2: perTable.oauth_connections_v2 ?? 0,
        oauth_connections: perTable.oauth_connections ?? 0,
      };
      const any = unsealed.oauth_connections_v2 + unsealed.oauth_connections > 0;
      value = { status: !keyed ? "no_key" : any ? "obf_rows_present" : "ok", unsealed, checked_at };
    } catch (err) {
      console.error("[blockid:oauth-seal] token health count failed:", err instanceof Error ? err.message : String(err));
      value = { status: keyed ? "unknown" : "no_key", unsealed: null, checked_at };
    }
  }
  cache = { value, at: now };
  return value;
}
