/** Options passed to every provider call. */
export interface AICallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Timeout in milliseconds. Default 30 000. Use 180 000 for long reports. */
  timeoutMs?: number;
  /** Tools for Claude (e.g. web_search). Ignored by non-Claude providers. */
  tools?: unknown[];
}

/** Successful result from a provider call. */
export interface AICallResult {
  text: string;
  provider: "claude" | "openai" | "gemini" | "groq" | "openrouter" | "ollama";
  model: string;
}

/** Provider identifier used for routing. */
export type Provider =
  | "claude-proxy"
  | "claude-oauth"
  | "openai-codex"
  | "gemini"
  | "groq"
  | "openrouter"
  | "claude-apikey"
  | "openai-apikey"
  | "ollama";

/** Admin-configured key row from Supabase ai_provider_keys table. */
export interface DBKey {
  provider: string;
  api_key: string;
  base_url: string | null;
  is_active: boolean;
}
